import { Inject, Injectable, InjectionToken, signal } from '@angular/core';
import { openDB, type IDBPDatabase } from 'idb';
import type { AppDatabase } from './database-schema';
import { DATABASE_VERSION, migrateDatabase } from './migrations';

export type StorageStatus = 'opening' | 'ready' | 'blocked' | 'closed' | 'error';
export const DATABASE_NAME = new InjectionToken<string>('DATABASE_NAME', { providedIn: 'root', factory: () => 'entrena-con-jesus' });
export class StorageFailure extends Error {
  constructor(readonly code: 'quota' | 'unavailable' | 'conflict' | 'invalid', message: string, cause?: unknown) {
    super(message, { cause });
  }
}
export function storageFailure(error: unknown): StorageFailure {
  if (error instanceof StorageFailure) return error;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new StorageFailure('quota', 'No queda espacio para guardar. Mantén este formulario abierto, libera espacio y vuelve a intentarlo.', error);
  }
  return new StorageFailure('unavailable', 'No se pudo guardar o leer el almacenamiento local. Tu formulario sigue abierto. Vuelve a intentarlo sin borrar los datos del navegador.', error);
}

@Injectable({ providedIn: 'root' })
export class Database {
  readonly status = signal<StorageStatus>('opening');
  private connection?: Promise<IDBPDatabase<AppDatabase>>;
  // Explicit construction is also used by framework-independent migration tests.
  // eslint-disable-next-line @angular-eslint/prefer-inject
  constructor(@Inject(DATABASE_NAME) readonly name: string = 'entrena-con-jesus') {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel(`entrena-restore:${name}`);
      channel.onmessage = event => {
        if (event.data !== 'restored') return;
        this.close(); this.status.set('closed');
        window.location.reload();
      };
      this.restoreChannel = channel;
    }
  }
  private restoreChannel?: BroadcastChannel;
  notifyRestored(): void { this.restoreChannel?.postMessage('restored'); }

  async open(): Promise<IDBPDatabase<AppDatabase>> {
    if (!this.connection) {
      this.status.set('opening');
      this.connection = openDB<AppDatabase>(this.name, DATABASE_VERSION, {
        upgrade: (db, oldVersion, _newVersion, transaction) => {
          // openDB propagates upgrade failure; also observe the separate idb transaction promise.
          void transaction.done.catch(() => undefined);
          migrateDatabase(db, oldVersion, transaction);
        },
        blocked: () => this.status.set('blocked'),
        blocking: () => { this.close(); this.status.set('closed'); },
        terminated: () => { this.connection = undefined; this.status.set('closed'); },
      }).then(db => { this.status.set('ready'); return db; }).catch(error => {
        this.connection = undefined;
        this.status.set('error');
        throw storageFailure(error);
      });
    }
    return this.connection;
  }

  close(): void {
    const connection = this.connection;
    this.connection = undefined;
    if (connection) void connection.then(db => db.close(), () => undefined);
  }
}
