import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GasService, GasReading, GasConfig } from '../services/gas.service';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, startWith } from 'rxjs/operators';

@Component({
  standalone: true,
  selector: 'app-history',
  imports: [CommonModule, RouterLink],
  templateUrl: './history.component.html',
  styleUrls: ['./history.component.css']
})
export class HistoryComponent implements OnInit {

  warn$!: Observable<number>;
  historyFiltered$!: Observable<GasReading[]>;

  constructor(private gas: GasService) {}

  ngOnInit(): void {
    // ✅ seuil WARN (fallback 35)
    this.warn$ = this.gas.config$().pipe(
      startWith({ warn: 35, alert: 60 } as GasConfig),
      map(cfg => cfg?.warn ?? 35),
      catchError(() => of(35))
    );
    

    // ✅ toutes les données history
    const history$ = this.gas.historyAll$().pipe(
      startWith([] as GasReading[]),
      catchError(() => of([] as GasReading[]))
    );

    // ✅ filtrage: index >= warn
    this.historyFiltered$ = combineLatest([history$, this.warn$]).pipe(
      map(([items, warn]) =>
        items
          .filter(it => Number(it.index ?? 0) >= warn)
          .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0)) // dernier en haut (optionnel)
      )
    );
  }
  



}