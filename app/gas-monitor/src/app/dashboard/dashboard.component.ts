import {
  Component,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  Inject,
  PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GasService, GasReading, GasConfig } from '../services/gas.service';
import { Observable, Subscription, combineLatest, of } from 'rxjs';
import { catchError, filter, map, startWith } from 'rxjs/operators';

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
} from 'chart.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
);

type StatusUI = 'OK' | 'WARN' | 'ALERT';

@Component({
  standalone: true,
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements AfterViewInit, OnDestroy {

  @ViewChild('gasChart') gasChart?: ElementRef<HTMLCanvasElement>;

  latest$!: Observable<GasReading | null>;
  config$!: Observable<GasConfig>;
  statusUI$!: Observable<StatusUI>;
  warn$!: Observable<number>;

  private chart?: Chart;
  private subs: Subscription[] = [];
  private isBrowser: boolean;

  // ---- Alarm UI state ----
  soundEnabled = false;
  alarmMuted = false;
  private currentlyAlerting = false;

  // ---- Test mode ----
  isTestAlert = false;
  private testTimeout?: number;

  // ---- WebAudio ----
  private audioCtx?: AudioContext;
  private alarmInterval?: number;

  constructor(
    private gas: GasService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    this.latest$ = this.gas.latest$();

    // ✅ seuils depuis Firebase (fallback)
    this.config$ = this.gas.config$().pipe(
      startWith({ warn: 35, alert: 60 } as GasConfig),
      map(cfg => cfg ?? { warn: 35, alert: 60 }),
      catchError(() => of({ warn: 35, alert: 60 }))
    );

    this.warn$ = this.config$.pipe(map(cfg => cfg.warn));

    // ✅ statut recalculé selon seuils Firebase
    this.statusUI$ = combineLatest([this.latest$, this.config$]).pipe(
      map(([latest, cfg]) => {
        if (!latest) return 'OK';
        const idx = latest.index ?? 0;
        if (idx >= cfg.alert) return 'ALERT';
        if (idx >= cfg.warn) return 'WARN';
        return 'OK';
      })
    );
  }

  badgeClass(status: string | undefined | null) {
    if (status === 'ALERT') return 'badge badge-alert';
    if (status === 'WARN') return 'badge badge-warn';
    return 'badge badge-ok';
  }

  // ---- UI actions ----
  enableSound() {
    if (!this.isBrowser) return;

    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    this.audioCtx.resume().then(() => {
      this.soundEnabled = true;
      if (this.currentlyAlerting && !this.alarmMuted) {
        this.startBeepLoop();
      }
    }).catch(() => {
      this.soundEnabled = false;
    });
  }

  stopAlarm() {
    this.alarmMuted = true;
    this.stopBeepLoop();

    if (this.isTestAlert) {
      this.isTestAlert = false;
      this.currentlyAlerting = false;
      if (this.testTimeout) window.clearTimeout(this.testTimeout);
    }
  }

  testAlert() {
    if (!this.isBrowser) return;

    this.isTestAlert = true;
    this.currentlyAlerting = true;
    this.alarmMuted = false;

    if (this.soundEnabled) {
      this.startBeepLoop();
    }

    if (this.testTimeout) window.clearTimeout(this.testTimeout);
    this.testTimeout = window.setTimeout(() => {
      this.isTestAlert = false;
      this.currentlyAlerting = false;
      this.stopBeepLoop();
    }, 10_000);
  }

  // ---- Audio helpers ----
  private beepOnce(durationMs = 180, freq = 950) {
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.04;

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    window.setTimeout(() => {
      osc.stop();
      osc.disconnect();
      gain.disconnect();
    }, durationMs);
  }

  private startBeepLoop() {
    if (!this.isBrowser || !this.soundEnabled || !this.audioCtx) return;
    if (this.alarmInterval) return;

    this.alarmInterval = window.setInterval(() => {
      this.beepOnce(180, 950);
    }, 550);
  }

  private stopBeepLoop() {
    if (this.alarmInterval) {
      window.clearInterval(this.alarmInterval);
      this.alarmInterval = undefined;
    }
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;

    const canvas = this.gasChart?.nativeElement;
    if (!canvas) return;

    // ✅ Chart (maintainAspectRatio false -> évite canvas invisible)
    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Indice MQ-2 (>= WARN)',
          data: [],
          tension: 0.25,
          pointRadius: 2,

          borderColor: '#60a5fa',
          backgroundColor: 'rgba(14, 187, 255, 0.12)',

          pointBackgroundColor: [],
          pointBorderColor: '#416cfaff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // ✅ important
        animation: false,
        scales: {
          y: { min: 0, max: 100 }
        }
      }
    });

    // ✅ Flux graphe filtré: history + warn (Firebase)
    const history$ = this.gas.history$(200).pipe(
      startWith([] as GasReading[]),
      catchError(() => of([] as GasReading[]))
    );

    this.subs.push(
      combineLatest([history$, this.warn$]).pipe(
        map(([items, warn]) =>
          items
            .filter(it => Number(it.index ?? 0) >= warn)
            .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))
        )
      ).subscribe(filtered => {
        if (!this.chart) return;

        // Si aucun point filtré => on affiche vide (normal)
        const labels = filtered.map(it => String(Math.floor((it.ts ?? 0) / 1000)));
        const values = filtered.map(it => it.index ?? 0);

        this.chart.data.labels = labels;
        this.chart.data.datasets[0].data = values;
        this.chart.update();
      })
    );

    // ✅ Alarm trigger sur statut recalculé
    this.subs.push(
      this.statusUI$.subscribe(status => {
        if (this.isTestAlert) return;

        const isAlert = status === 'ALERT';
        this.currentlyAlerting = isAlert;

        if (!isAlert) {
          this.alarmMuted = false;
          this.stopBeepLoop();
          return;
        }

        if (this.soundEnabled && !this.alarmMuted) {
          this.startBeepLoop();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.chart?.destroy();
    this.stopBeepLoop();
    if (this.testTimeout) window.clearTimeout(this.testTimeout);
  }
}