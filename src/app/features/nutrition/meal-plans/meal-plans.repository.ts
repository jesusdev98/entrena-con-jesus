import { Injectable, inject } from '@angular/core';
import { newId, type UUID } from '../../../core/domain/identity';
import { Database, StorageFailure, storageFailure } from '../../../core/storage/database';
import { OwnedRepository } from '../../../core/storage/owned.repository';
import type { Draft } from '../../../core/storage/draft.model';
import type { MealPlanRevision } from '../nutrition.model';
import { savedContent } from './meal-planning';

export type MealPlanDraft = Draft & { payload: Extract<Draft['payload'], { kind: 'meal-plan' }> };
export function latestPlan(revisions: MealPlanRevision[], planId: UUID): MealPlanRevision | undefined {
  const matches = revisions.filter(item => item.planId === planId);
  const ids = new Set(matches.map(item => item.id));
  if (ids.size !== matches.length || matches.filter(item => item.parentRevisionId === null).length !== (matches.length ? 1 : 0) ||
    matches.some(item => item.parentRevisionId !== null && !ids.has(item.parentRevisionId)))
    throw new StorageFailure('conflict', 'El plan tiene revisiones incompletas. Revisa las versiones antes de continuar.');
  const parents = new Set(matches.map(item => item.parentRevisionId));
  const heads = matches.filter(item => !parents.has(item.id));
  if (heads.length > 1 || (matches.length && heads.length !== 1)) throw new StorageFailure('conflict', 'El plan tiene revisiones divergentes. Revisa las versiones antes de continuar.');
  const byId = new Map(matches.map(item => [item.id, item]));
  const chain = new Set<UUID>();
  for (let cursor: MealPlanRevision | undefined = heads[0]; cursor; cursor = cursor.parentRevisionId ? byId.get(cursor.parentRevisionId) : undefined) chain.add(cursor.id);
  if (chain.size !== matches.length) throw new StorageFailure('conflict', 'El plan tiene revisiones incompletas. Revisa las versiones antes de continuar.');
  return heads[0];
}

@Injectable({ providedIn: 'root' })
export class MealPlansRepository {
  private readonly db = inject(Database);
  private readonly revisions = new OwnedRepository(this.db, 'mealPlanRevisions');
  private readonly drafts = new OwnedRepository(this.db, 'drafts');
  history(owner: UUID): Promise<MealPlanRevision[]> { return this.revisions.list(owner); }
  async latest(owner: UUID, planId: UUID): Promise<MealPlanRevision | undefined> { return latestPlan(await this.revisions.list(owner), planId); }
  async list(owner: UUID): Promise<MealPlanRevision[]> {
    const all = await this.revisions.list(owner);
    return [...new Set(all.map(item => item.planId))].map(id => latestPlan(all, id)!).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
  async listDrafts(owner: UUID): Promise<MealPlanDraft[]> {
    return (await this.drafts.list(owner)).filter((draft): draft is MealPlanDraft => draft.payload.kind === 'meal-plan');
  }
  /** Full payload comparison protects even edits made within the same clock tick. */
  async saveDraft(owner: UUID, draft: MealPlanDraft, previous: MealPlanDraft | null): Promise<void> {
    if (draft.personId !== owner || draft.payload.kind !== 'meal-plan' || !draft.payload.planId || !draft.editorKey) throw new StorageFailure('invalid', 'El borrador pertenece a otra persona o está incompleto.');
    const tx = (await this.db.open()).transaction(['settings', 'people', 'mealPlanRevisions', 'drafts'], 'readwrite');
    try {
      const settings = await tx.objectStore('settings').get('workspace');
      const person = await tx.objectStore('people').get(owner);
      if (!settings?.mode || settings.activePersonId !== owner || !person || person.archived || (settings.mode === 'client' && settings.personalPersonId !== owner)) throw new StorageFailure('invalid', 'La persona activa cambió. Vuelve a su espacio.');
      const current = latestPlan(await tx.objectStore('mealPlanRevisions').index('by-person').getAll(owner), draft.payload.planId);
      if (draft.payload.baseRevisionId !== null && !current ||
        current && draft.payload.baseRevisionId === null) throw new StorageFailure('conflict', 'El plan ya no está disponible para editar. Guarda una copia si quieres conservar los cambios.');
      const stored = await tx.objectStore('drafts').index('by-editor').get([owner, draft.editorKey]);
      if (JSON.stringify(stored ?? null) !== JSON.stringify(previous)) throw new StorageFailure('conflict', 'El borrador cambió en otra pestaña. Compara antes de continuar.');
      if (stored && stored.id !== draft.id) throw new StorageFailure('conflict', 'El borrador cambió de identidad. Compara antes de continuar.');
      await tx.objectStore('drafts').put(structuredClone(draft));
      await tx.done;
    } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await tx.done.catch(() => undefined); throw storageFailure(error); }
  }
  async save(owner: UUID, draft: MealPlanDraft): Promise<MealPlanRevision> {
    let content: MealPlanRevision['content'];
    try { content = savedContent(draft.payload.name, draft.payload.content); }
    catch (error) { throw new StorageFailure('invalid', (error as Error).message); }
    return this.append(owner, draft.payload.planId, draft.payload.baseRevisionId, { name: draft.payload.name.trim(), content, archived: false }, draft);
  }
  async setArchived(owner: UUID, current: MealPlanRevision, archived: boolean): Promise<MealPlanRevision> {
    if (current.personId !== owner) throw new StorageFailure('invalid', 'El plan pertenece a otra persona.');
    return this.append(owner, current.planId, current.id, { name: current.name, content: current.content, archived });
  }
  async deletePermanently(owner: UUID, expected: MealPlanRevision): Promise<void> {
    if (expected.personId !== owner) throw new StorageFailure('invalid', 'El plan pertenece a otra persona.');
    const tx = (await this.db.open()).transaction(['settings', 'people', 'mealPlanRevisions', 'drafts'], 'readwrite');
    try {
      const settings = await tx.objectStore('settings').get('workspace');
      const person = await tx.objectStore('people').get(owner);
      if (!settings?.mode || settings.activePersonId !== owner || !person || person.archived || (settings.mode === 'client' && settings.personalPersonId !== owner)) throw new StorageFailure('invalid', 'La persona activa cambió. Vuelve a su espacio.');
      const revisions = (await tx.objectStore('mealPlanRevisions').index('by-person').getAll(owner)).filter(item => item.planId === expected.planId);
      if (!revisions.length || latestPlan(revisions, expected.planId)?.id !== expected.id) throw new StorageFailure('conflict', 'El plan cambió o ya fue eliminado. Actualiza la lista antes de continuar.');
      const drafts = (await tx.objectStore('drafts').index('by-person').getAll(owner)).filter(item => item.payload.kind === 'meal-plan' && item.payload.planId === expected.planId);
      for (const revision of revisions) await tx.objectStore('mealPlanRevisions').delete([owner, revision.id]);
      for (const draft of drafts) await tx.objectStore('drafts').delete([owner, draft.id]);
      await tx.done;
    } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await tx.done.catch(() => undefined); throw storageFailure(error); }
  }
  private async append(owner: UUID, planId: UUID, base: UUID | null,
    value: Pick<MealPlanRevision, 'name' | 'content' | 'archived'>, draft?: MealPlanDraft): Promise<MealPlanRevision> {
    const tx = (await this.db.open()).transaction(['settings', 'people', 'mealPlanRevisions', 'drafts'], 'readwrite');
    try {
      const settings = await tx.objectStore('settings').get('workspace');
      const person = await tx.objectStore('people').get(owner);
      if (!settings?.mode || settings.activePersonId !== owner || !person || person.archived || (settings.mode === 'client' && settings.personalPersonId !== owner)) throw new StorageFailure('invalid', 'La persona activa cambió. Vuelve a su espacio para guardar.');
      const current = latestPlan(await tx.objectStore('mealPlanRevisions').index('by-person').getAll(owner), planId);
      if ((current?.id ?? null) !== base) throw new StorageFailure('conflict', 'El plan cambió en otra pestaña. Compara la versión guardada con tu borrador.');
      if (draft) {
        if (draft.personId !== owner || draft.payload.kind !== 'meal-plan' || draft.payload.planId !== planId || draft.payload.baseRevisionId !== base || current?.archived) throw new StorageFailure('conflict', 'El plan o su borrador ya no se puede editar.');
        const stored = await tx.objectStore('drafts').get([owner, draft.id]);
        const byEditor = await tx.objectStore('drafts').index('by-editor').get([owner, draft.editorKey]);
        if (JSON.stringify(stored) !== JSON.stringify(draft) || byEditor?.id !== draft.id) throw new StorageFailure('conflict', 'El borrador cambió en otra pestaña.');
        await tx.objectStore('drafts').delete([owner, draft.id]);
      } else if (!current) throw new StorageFailure('invalid', 'El plan no existe.');
      const now = new Date().toISOString();
      const revision: MealPlanRevision = { id: newId(), personId: owner, planId, parentRevisionId: base, createdAt: now, updatedAt: now, ...structuredClone(value) };
      await tx.objectStore('mealPlanRevisions').add(revision);
      await tx.done;
      return revision;
    } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await tx.done.catch(() => undefined); throw storageFailure(error); }
  }
}
