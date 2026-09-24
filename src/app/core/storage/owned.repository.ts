import type { StoreValue } from 'idb';
import type { UUID } from '../domain/identity';
import { Database, StorageFailure, storageFailure } from './database';
import type { AppDatabase, OwnedStoreName } from './database-schema';

export interface PersonRepository<T> {
  get(personId: UUID, id: UUID): Promise<T | undefined>;
  list(personId: UUID): Promise<T[]>;
  add(personId: UUID, record: T): Promise<void>;
}

/** Compound keys isolate even identical foreign record IDs in different people. */
export class OwnedRepository<S extends OwnedStoreName> implements PersonRepository<StoreValue<AppDatabase, S>> {
  constructor(private readonly database: Database, readonly storeName: S) {}

  async get(personId: UUID, id: UUID): Promise<StoreValue<AppDatabase, S> | undefined> {
    try { return await (await this.database.open()).get(this.storeName, [personId, id]); }
    catch (error) { throw storageFailure(error); }
  }
  async list(personId: UUID): Promise<StoreValue<AppDatabase, S>[]> {
    try { return await (await this.database.open()).getAllFromIndex(this.storeName, 'by-person', IDBKeyRange.only(personId)); }
    catch (error) { throw storageFailure(error); }
  }
  async add(personId: UUID, record: StoreValue<AppDatabase, S>): Promise<void> {
    if (record.personId !== personId) throw new StorageFailure('invalid', 'El registro pertenece a otra persona.');
    const db = await this.database.open();
    const tx = db.transaction([this.storeName, 'people'], 'readwrite');
    try {
      if (!await tx.objectStore('people').get(personId)) throw new StorageFailure('invalid', 'La persona no existe.');
      await tx.objectStore(this.storeName).add(record);
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* The transaction may already have aborted. */ }
      await tx.done.catch(() => undefined);
      throw storageFailure(error);
    }
  }
}
