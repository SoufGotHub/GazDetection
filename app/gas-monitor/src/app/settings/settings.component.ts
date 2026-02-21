import { Component, Inject, PLATFORM_ID, OnDestroy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GasService } from '../services/gas.service';
import { Subscription, of } from 'rxjs';
import { catchError, startWith } from 'rxjs/operators';

@Component({
  standalone: true,
  selector: 'app-settings',
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnDestroy {
  warn = 35;
  alert = 60;

  loading = true;
  saving = false;

  msg: { type: 'ok' | 'err'; text: string } | null = null;

  private isBrowser: boolean;
  private sub?: Subscription;

  constructor(
    private gas: GasService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    // ⚠️ En SSR, AngularFire ne doit pas bloquer l'UI
    if (!this.isBrowser) {
      this.loading = false;
      return;
    }

    // ✅ startWith(null) + catchError => ne reste JAMAIS bloqué
    this.sub = this.gas.config$().pipe(
      startWith(null), // débloque immédiatement le loading
      catchError(err => {
        console.error('Erreur lecture config Firebase:', err);
        this.msg = {
          type: 'err',
          text: 'Impossible de lire la configuration (rules Firebase ?)'
        };
        return of(null);
      })
    ).subscribe(cfg => {
      if (cfg?.warn != null) this.warn = Number(cfg.warn);
      if (cfg?.alert != null) this.alert = Number(cfg.alert);
      this.loading = false;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  // ---------- Validation ----------
  private validate(): string | null {
    if (!Number.isFinite(this.warn) || !Number.isFinite(this.alert)) {
      return 'Valeurs invalides.';
    }
    if (this.warn < 1 || this.warn > 99) {
      return 'WARN doit être entre 1 et 99.';
    }
    if (this.alert < 1 || this.alert > 100) {
      return 'ALERT doit être entre 1 et 100.';
    }
    if (this.alert <= this.warn) {
      return 'ALERT doit être strictement supérieur à WARN.';
    }
    return null;
  }

  // ---------- Actions ----------
  async save() {
    this.msg = null;

    const err = this.validate();
    if (err) {
      this.msg = { type: 'err', text: err };
      return;
    }

    this.saving = true;
    try {
      await this.gas.saveConfig(this.warn, this.alert);
      this.msg = {
        type: 'ok',
        text: 'Seuils enregistrés dans Firebase ✅'
      };
    } catch (e) {
      console.error('Erreur sauvegarde config:', e);
      this.msg = {
        type: 'err',
        text: 'Erreur lors de la sauvegarde (rules Firebase ?)'
      };
    } finally {
      this.saving = false;
    }
  }

  resetDefaults() {
    this.warn = 35;
    this.alert = 60;
    this.msg = {
      type: 'ok',
      text: 'Valeurs par défaut appliquées (pense à enregistrer).'
    };
  }
}
