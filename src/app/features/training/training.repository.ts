import { Injectable, inject } from '@angular/core';
import type { IDBPTransaction } from 'idb';
import { newId, type LocalDate, type UUID } from '../../core/domain/identity';
import { Database, StorageFailure, storageFailure } from '../../core/storage/database';
import type { AppDatabase } from '../../core/storage/database-schema';
import type { Draft } from '../../core/storage/draft.model';
import { OwnedRepository } from '../../core/storage/owned.repository';
import { frozenSession, sessionErrors, startSession } from './training-domain';
import type { TrainingSession } from './training.model';

export type TrainingDraft = Draft & { payload: Extract<Draft['payload'], { kind: 'training' }> };
const stores = ['settings', 'people', 'routineRevisions', 'trainingSessions', 'drafts'] as const;
type Transaction = IDBPTransaction<AppDatabase, typeof stores, 'readwrite'>;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
@Injectable({ providedIn: 'root' })
export class TrainingRepository {
  private readonly database = inject(Database);
  private readonly sessions = new OwnedRepository(this.database, 'trainingSessions');
  private readonly drafts = new OwnedRepository(this.database, 'drafts');
  list(owner: UUID): Promise<TrainingSession[]> { return this.sessions.list(owner); }
  async get(owner: UUID, id: UUID): Promise<TrainingSession | null> { return (await this.database.open()).get('trainingSessions', [owner, id]).then(value => value ?? null); }
  async listDrafts(owner: UUID): Promise<TrainingDraft[]> { return (await this.drafts.list(owner)).filter((d): d is TrainingDraft => d.payload.kind === 'training'); }
  private draft(session: TrainingSession, baseSession: TrainingSession | null): TrainingDraft {
    const now = new Date().toISOString();
    return { id: newId(), personId: session.personId, editorKey: `training:${session.id}`, createdAt: now, updatedAt: now,
      payload: { kind: 'training', session: { ...structuredClone(session), status: 'draft' }, baseSession: structuredClone(baseSession) } };
  }
  async start(owner: UUID, revisionId: UUID, weekId: UUID, dayId: UUID, date: LocalDate): Promise<TrainingDraft> {
    return this.write(owner, true, async tx => {
      const revision = await tx.objectStore('routineRevisions').get([owner, revisionId]);
      if (!revision) throw new StorageFailure('invalid', 'No existe esa revisión para esta persona.');
      const draft = this.draft(startSession(revision, weekId, dayId, date), null);
      await tx.objectStore('drafts').add(draft); return draft;
    });
  }
  async reopen(owner: UUID, id: UUID): Promise<TrainingDraft> {
    return this.write(owner, true, async tx => {
      const recovered = await tx.objectStore('drafts').index('by-editor').get([owner, `training:${id}`]);
      if (recovered?.payload.kind === 'training') return recovered as TrainingDraft;
      const session = await tx.objectStore('trainingSessions').get([owner, id]);
      if (!session) throw new StorageFailure('invalid', 'La sesión no está disponible.');
      const draft = this.draft(session, session); await tx.objectStore('drafts').add(draft); return draft;
    });
  }
  async saveDraft(owner: UUID, draft: TrainingDraft, previous: TrainingDraft): Promise<void> {
    this.assertOwned(owner, draft);
    if (!equal(frozenSession(draft.payload.session), frozenSession(previous.payload.session)) || !equal(draft.payload.baseSession, previous.payload.baseSession)
      || draft.id !== previous.id || draft.editorKey !== previous.editorKey) throw new StorageFailure('invalid', 'La prescripción congelada no puede modificarse.');
    await this.write(owner, false, async tx => {
      const stored = await tx.objectStore('drafts').index('by-editor').get([owner, draft.editorKey]);
      if (!equal(stored, previous)) throw new StorageFailure('conflict', 'El borrador cambió en otra pestaña. Conserva tus valores y compara.');
      await tx.objectStore('drafts').put(structuredClone(draft));
    });
  }
  async save(owner: UUID, draft: TrainingDraft): Promise<TrainingSession> {
    this.assertOwned(owner, draft);
    const errors = sessionErrors(draft.payload.session);
    if (errors.length) throw new StorageFailure('invalid', errors.join('\n'));
    return this.write(owner, true, async tx => {
      const stored = await tx.objectStore('drafts').get([owner, draft.id]);
      if (!equal(stored, draft)) throw new StorageFailure('conflict', 'El borrador cambió o ya fue guardado en otra pestaña.');
      const session = draft.payload.session;
      const current = await tx.objectStore('trainingSessions').get([owner, session.id]) ?? null;
      if (!equal(current, draft.payload.baseSession)) throw new StorageFailure('conflict', 'La sesión guardada cambió. Revisa la corrección antes de continuar.');
      if (current && !equal(frozenSession(current), frozenSession(session))) throw new StorageFailure('invalid', 'La prescripción histórica no puede modificarse.');
      const now = new Date().toISOString();
      const saved: TrainingSession = { ...structuredClone(session), status: 'completed', version: (current?.version ?? 0) + 1,
        updatedAt: now, completedAt: current?.completedAt ?? now, durationSource: session.durationMinutes === null ? null : 'manual' };
      await tx.objectStore('drafts').delete([owner, draft.id]);
      await tx.objectStore('trainingSessions').put(saved);
      return saved;
    });
  }
  /** Explicitly abandon local edits and recover the latest durable draft or saved session. */
  async recover(owner: UUID, id: UUID): Promise<TrainingDraft> {
    return this.write(owner, true, async tx => {
      const stored = await tx.objectStore('drafts').index('by-editor').get([owner, `training:${id}`]);
      const current = await tx.objectStore('trainingSessions').get([owner, id]) ?? null;
      if (stored?.payload.kind === 'training' && equal(stored.payload.baseSession, current)) return stored as TrainingDraft;
      if (!current) throw new StorageFailure('invalid', 'La sesión no está disponible para recuperar.');
      const draft = this.draft(current, current);
      if (stored) await tx.objectStore('drafts').delete([owner, stored.id]);
      await tx.objectStore('drafts').add(draft); return draft;
    });
  }
  private assertOwned(owner: UUID, draft: TrainingDraft): void {
    if (draft.personId !== owner || draft.payload.session.personId !== owner || (draft.payload.baseSession && draft.payload.baseSession.personId !== owner)
      || draft.editorKey !== `training:${draft.payload.session.id}`) throw new StorageFailure('invalid', 'El registro pertenece a otra persona.');
  }
  private async write<T>(ownerId: UUID, active: boolean, operation: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx = (await this.database.open()).transaction(stores, 'readwrite');
    try {
      const owner = await tx.objectStore('people').get(ownerId);
      if (!owner || owner.archived) throw new StorageFailure('invalid', 'La persona no está disponible.');
      if (active) {
        const settings = await tx.objectStore('settings').get('workspace');
        if (!settings?.mode || settings.activePersonId !== ownerId || (settings.mode === 'client' && settings.personalPersonId !== ownerId)) throw new StorageFailure('invalid', 'La persona activa cambió. Vuelve a su espacio para guardar.');
      }
      const result = await operation(tx); await tx.done; return result;
    } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await tx.done.catch(() => undefined); throw storageFailure(error); }
  }
}
