import { Injectable, inject } from '@angular/core';
import { Database, StorageFailure, storageFailure } from './database';
import type { Draft } from './draft.model';
import type { UUID } from '../domain/identity';

@Injectable({ providedIn: 'root' })
export class DraftsRepository {
  private readonly database = inject(Database);
  async find(personId: UUID, editorKey: string): Promise<Draft | undefined> {
    try { return await (await this.database.open()).getFromIndex('drafts', 'by-editor', [personId, editorKey]); }
    catch (error) { throw storageFailure(error); }
  }
  async save(personId: UUID, draft: Draft): Promise<void> {
    if (draft.personId !== personId) throw new StorageFailure('invalid', 'El borrador pertenece a otra persona.');
    const tx = (await this.database.open()).transaction(['people', 'drafts'], 'readwrite');
    try {
      if (!await tx.objectStore('people').get(personId)) throw new StorageFailure('invalid', 'La persona no existe.');
      await tx.objectStore('drafts').put(draft);
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* Already completed or aborted. */ }
      await tx.done.catch(() => undefined);
      throw storageFailure(error);
    }
  }
}
