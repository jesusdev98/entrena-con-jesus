import { Injectable, inject } from '@angular/core';
import type { IDBPTransaction } from 'idb';
import { newId } from '../../core/domain/identity';
import { Database, StorageFailure, storageFailure } from '../../core/storage/database';
import type { AppDatabase } from '../../core/storage/database-schema';
import type { BackupPayload } from './transfer.model';
import { BACKUP_STORES, MAX_BACKUP_BYTES, checksum, parseBackup, validateBackup, type BackupFile } from './backup-schema';

export interface BackupReview { file: BackupFile; previous: string; people: { id: string; name: string; kind: string }[];
  counts: { store: string; incoming: number; existing: number }[] }

async function snapshot(tx: IDBPTransaction<AppDatabase, typeof BACKUP_STORES[number][], 'readonly' | 'readwrite'>): Promise<BackupPayload> {
  // Issue every request while the transaction is live; await only IndexedDB requests.
  const rows = await Promise.all(BACKUP_STORES.map(name => tx.objectStore(name).getAll()));
  return Object.fromEntries(BACKUP_STORES.map((name, index) => [name, rows[index]])) as BackupPayload;
}

@Injectable({ providedIn: 'root' })
export class BackupExchange {
  private readonly database = inject(Database);

  private async current(): Promise<BackupPayload> {
    const tx = (await this.database.open()).transaction(BACKUP_STORES, 'readonly');
    const rows = await snapshot(tx); await tx.done;
    return rows;
  }

  async export(): Promise<string> {
    const payload = await this.current();
    if (payload.settings.length !== 1) throw new StorageFailure('invalid', 'Primero crea tu espacio personal.');
    validateBackup(payload);
    const file = { app: 'entrena-con-jesus', schemaVersion: 1, kind: 'backup', exportId: newId(),
      exportedAt: new Date().toISOString(), checksum: await checksum(payload), payload };
    const text = JSON.stringify(file);
    if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new StorageFailure('invalid', 'La copia supera el límite de 20 MiB. No se descargó un archivo incompleto.');
    return text;
  }

  async review(text: string): Promise<BackupReview> {
    const file = await parseBackup(text);
    const current = await this.current();
    return { file, previous: JSON.stringify(current),
      people: file.payload.people.map(p => ({ id: p.id, name: p.displayName, kind: p.kind })),
      counts: BACKUP_STORES.map(store => ({ store, incoming: file.payload[store].length, existing: current[store].length })) };
  }

  async restore(review: BackupReview): Promise<void> {
    // Never trust a mutable review object; revalidate the complete payload before opening a write transaction.
    const file = await parseBackup(JSON.stringify(review.file));
    const db = await this.database.open();
    const tx = db.transaction(BACKUP_STORES, 'readwrite');
    try {
      const current = await snapshot(tx);
      if (JSON.stringify(current) !== review.previous) throw new StorageFailure('conflict', 'Los datos locales cambiaron desde la revisión. Vuelve a seleccionar la copia.');
      for (const store of BACKUP_STORES) await tx.objectStore(store).clear();
      // Queue all inserts before awaiting completion; failure aborts every store, including settings and drafts.
      const writes: Promise<unknown>[] = [];
      const queue = (request: Promise<unknown>) => { void request.catch(() => undefined); writes.push(request); };
      for (const row of file.payload.settings) queue(tx.objectStore('settings').add(row));
      for (const row of file.payload.people) queue(tx.objectStore('people').add(row));
      for (const row of file.payload.profileRevisions) queue(tx.objectStore('profileRevisions').add(row));
      for (const row of file.payload.customExercises) queue(tx.objectStore('customExercises').add(row));
      for (const row of file.payload.customFoods) queue(tx.objectStore('customFoods').add(row));
      for (const row of file.payload.routineRevisions) queue(tx.objectStore('routineRevisions').add(row));
      for (const row of file.payload.mealPlanRevisions) queue(tx.objectStore('mealPlanRevisions').add(row));
      for (const row of file.payload.trainingSessions) queue(tx.objectStore('trainingSessions').add(row));
      for (const row of file.payload.foodLogs) queue(tx.objectStore('foodLogs').add(row));
      for (const row of file.payload.dailySnapshots) queue(tx.objectStore('dailySnapshots').add(row));
      for (const row of file.payload.mealConsumptions) queue(tx.objectStore('mealConsumptions').add(row));
      for (const row of file.payload.drafts) queue(tx.objectStore('drafts').add(row));
      for (const row of file.payload.externalSubjects) queue(tx.objectStore('externalSubjects').add(row));
      await Promise.all(writes);
      await tx.done;
      this.database.notifyRestored();
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted. */ }
      await tx.done.catch(() => undefined);
      throw storageFailure(error);
    }
  }
}
