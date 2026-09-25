import { Injectable, inject } from '@angular/core';
import { Database, StorageFailure, storageFailure } from '../../core/storage/database';
import { OwnedRepository } from '../../core/storage/owned.repository';
import { newId, type UUID } from '../../core/domain/identity';
import type { Draft } from '../../core/storage/draft.model';
import type { RoutineRevision } from './routine.model';
import { savedContent } from './routine-planning';

export type RoutineDraft = Draft & { payload: Extract<Draft['payload'], { kind: 'routine' }> };
export function latestRevision(revisions: RoutineRevision[], planId: UUID): RoutineRevision | undefined {
  const matches = revisions.filter(revision => revision.planId === planId);
  const parents = new Set(matches.map(revision => revision.parentRevisionId));
  const heads = matches.filter(revision => !parents.has(revision.id));
  if (heads.length > 1 || (matches.length && !heads.length)) throw new StorageFailure('conflict', 'La rutina tiene revisiones divergentes. Conserva los datos para revisarlos.');
  return heads[0];
}
@Injectable({ providedIn: 'root' })
export class RoutinesRepository {
  private readonly database = inject(Database);
  private readonly revisions = new OwnedRepository(this.database, 'routineRevisions');
  private readonly drafts = new OwnedRepository(this.database, 'drafts');
  history(personId: UUID): Promise<RoutineRevision[]> { return this.revisions.list(personId); }
  async latest(personId: UUID, planId: UUID): Promise<RoutineRevision | undefined> { return latestRevision(await this.history(personId), planId); }
  async list(personId: UUID): Promise<RoutineRevision[]> {
    const all = await this.history(personId);
    return [...new Set(all.map(revision => revision.planId))].map(id => latestRevision(all, id)!).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
  async listDrafts(personId: UUID): Promise<RoutineDraft[]> { return (await this.drafts.list(personId)).filter((draft): draft is RoutineDraft => draft.payload.kind === 'routine'); }

  /** Compare the entire last persisted draft, including same-timestamp changes from another tab. */
  async saveDraft(personId: UUID, draft: RoutineDraft, previous: RoutineDraft | null): Promise<void> {
    if (draft.personId !== personId) throw new StorageFailure('invalid', 'El borrador pertenece a otra persona.');
    const tx = (await this.database.open()).transaction(['people', 'routineRevisions', 'drafts'], 'readwrite');
    try {
      const owner = await tx.objectStore('people').get(personId);
      if (!owner || owner.archived) throw new StorageFailure('invalid', 'La persona no está disponible.');
      const current = latestRevision(await tx.objectStore('routineRevisions').index('by-person').getAll(personId), draft.payload.planId);
      if (draft.payload.baseRevisionId !== null && !current ||
        current && draft.payload.baseRevisionId === null) throw new StorageFailure('conflict', 'La rutina ya no está disponible para editar. Guarda una copia si quieres conservar los cambios.');
      const stored = await tx.objectStore('drafts').index('by-editor').get([personId, draft.editorKey]);
      if (JSON.stringify(stored ?? null) !== JSON.stringify(previous)) throw new StorageFailure('conflict', 'El borrador cambió en otra pestaña. Compara antes de continuar.');
      await tx.objectStore('drafts').put(structuredClone(draft));
      await tx.done;
    } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await tx.done.catch(() => undefined); throw storageFailure(error); }
  }
  async save(personId: UUID, draft: RoutineDraft): Promise<RoutineRevision> {
    let content: RoutineRevision['content'];
    try { content = savedContent(draft.payload.name, draft.payload.content); }
    catch (error) { throw new StorageFailure('invalid', (error as Error).message); }
    return this.append(personId, draft.payload.planId, draft.payload.baseRevisionId, { name: draft.payload.name.trim(), content, archived: false }, draft);
  }
  async setArchived(personId: UUID, current: RoutineRevision, archived: boolean): Promise<RoutineRevision> {
    if (current.personId !== personId) throw new StorageFailure('invalid', 'La rutina pertenece a otra persona.');
    return this.append(personId, current.planId, current.id, { name: current.name, content: current.content, archived });
  }
  async deletePermanently(personId: UUID, expected: RoutineRevision): Promise<void> {
    if (expected.personId !== personId) throw new StorageFailure('invalid', 'La rutina pertenece a otra persona.');
    const tx = (await this.database.open()).transaction(['settings', 'people', 'routineRevisions', 'drafts'], 'readwrite');
    try {
      const settings = await tx.objectStore('settings').get('workspace');
      const owner = await tx.objectStore('people').get(personId);
      if (!settings?.mode || settings.activePersonId !== personId || !owner || owner.archived || (settings.mode === 'client' && settings.personalPersonId !== personId)) throw new StorageFailure('invalid', 'La persona activa cambió. Vuelve a su espacio.');
      const revisions = (await tx.objectStore('routineRevisions').index('by-person').getAll(personId)).filter(item => item.planId === expected.planId);
      if (!revisions.length || latestRevision(revisions, expected.planId)?.id !== expected.id) throw new StorageFailure('conflict', 'La rutina cambió o ya fue eliminada. Actualiza la lista antes de continuar.');
      const drafts = (await tx.objectStore('drafts').index('by-person').getAll(personId)).filter(item => item.payload.kind === 'routine' && item.payload.planId === expected.planId);
      for (const revision of revisions) await tx.objectStore('routineRevisions').delete([personId, revision.id]);
      for (const draft of drafts) await tx.objectStore('drafts').delete([personId, draft.id]);
      await tx.done;
    } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await tx.done.catch(() => undefined); throw storageFailure(error); }
  }
  private async append(personId: UUID, planId: UUID, base: UUID | null,
    value: Pick<RoutineRevision, 'name' | 'content' | 'archived'>, draft?: RoutineDraft): Promise<RoutineRevision> {
    const tx = (await this.database.open()).transaction(['settings', 'people', 'routineRevisions', 'drafts'], 'readwrite');
    try {
      const settings = await tx.objectStore('settings').get('workspace');
      const owner = await tx.objectStore('people').get(personId);
      if (!settings?.mode || settings.activePersonId !== personId || !owner || owner.archived || (settings.mode === 'client' && settings.personalPersonId !== personId)) throw new StorageFailure('invalid', 'La persona activa cambió. Vuelve a su espacio para guardar este borrador.');
      const current = latestRevision(await tx.objectStore('routineRevisions').index('by-person').getAll(personId), planId);
      if ((current?.id ?? null) !== base) throw new StorageFailure('conflict', 'La rutina cambió en otra pestaña. Compara la versión guardada con tu borrador.');
      if (draft) {
        if (draft.payload.planId !== planId || draft.payload.baseRevisionId !== base || current?.archived) throw new StorageFailure('conflict', 'La rutina ya no se puede editar.');
        const stored = await tx.objectStore('drafts').get([personId, draft.id]);
        if (draft.personId !== personId || JSON.stringify(stored) !== JSON.stringify(draft)) throw new StorageFailure('conflict', 'El borrador cambió o pertenece a otra persona. Compara antes de guardar.');
        await tx.objectStore('drafts').delete([personId, draft.id]);
      } else if (!current) throw new StorageFailure('invalid', 'La rutina no existe.');
      const now = new Date().toISOString();
      const revision: RoutineRevision = { id: newId(), personId, planId, parentRevisionId: base, createdAt: now, updatedAt: now, ...structuredClone(value) };
      await tx.objectStore('routineRevisions').add(revision);
      await tx.done;
      return revision;
    } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await tx.done.catch(() => undefined); throw storageFailure(error); }
  }
}
