import { Injectable } from '@angular/core';
import {
  Database,
  objectVal,
  listVal,
  ref,
  query,
  limitToLast,
  set,
  update
} from '@angular/fire/database';
import { Observable, map } from 'rxjs';

export interface GasReading {
  ts: number;
  adc: number;
  index: number;
  status: 'OK' | 'WARN' | 'ALERT' | string;
  warn?: number;
  alert?: number;
}

export interface GasConfig {
  warn: number;
  alert: number;
}

@Injectable({ providedIn: 'root' })
export class GasService {
  deviceId = 'esp32_01';

  constructor(private db: Database) {}

  // ----- LIVE -----
  latest$(): Observable<GasReading | null> {
    const r = ref(this.db, `devices/${this.deviceId}/latest`);
    return objectVal<GasReading>(r);
  }

  // Derniers N points (utile pour le graphe)
  history$(limit = 50): Observable<GasReading[]> {
    const baseRef = ref(this.db, `devices/${this.deviceId}/history`);
    const q = query(baseRef, limitToLast(limit));

    return listVal<GasReading>(q).pipe(
      map(items =>
        items
          .filter(Boolean)
          .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))
      )
    );
  }

  // ✅ Tous les points (utile pour la page historique)
  historyAll$(): Observable<GasReading[]> {
    const baseRef = ref(this.db, `devices/${this.deviceId}/history`);

    return listVal<GasReading>(baseRef).pipe(
      map(items =>
        items
          .filter(Boolean)
          .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))
      )
    );
  }

  // ----- SETTINGS (thresholds) -----
  config$(): Observable<GasConfig | null> {
    const r = ref(this.db, `devices/${this.deviceId}/config`);
    return objectVal<GasConfig>(r);
  }

  async saveConfig(warn: number, alert: number): Promise<void> {
    const r = ref(this.db, `devices/${this.deviceId}/config`);
    await set(r, { warn, alert });
  }

  async updateConfig(partial: Partial<GasConfig>): Promise<void> {
    const r = ref(this.db, `devices/${this.deviceId}/config`);
    await update(r, partial);
  }
}