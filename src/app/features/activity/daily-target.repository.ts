import { Injectable, inject, signal } from '@angular/core';
import type { IDBPTransaction } from 'idb';
import { localDate, newId, type LocalDate, type UUID } from '../../core/domain/identity';
import { Database, StorageFailure, storageFailure } from '../../core/storage/database';
import type { AppDatabase } from '../../core/storage/database-schema';
import type { Draft } from '../../core/storage/draft.model';
import type { MetCatalog } from './met-catalog';
import { calculateActivity, capturedContext, initialActivity, today, updatedProfileDefaults, type ActivityDraftPayload, type DailyTargetSnapshot } from './daily-target.model';

export type ActivityDraft = Draft & { payload: ActivityDraftPayload };
const stores = ['settings', 'people', 'profileRevisions', 'dailySnapshots', 'trainingSessions', 'drafts'] as const;
type Transaction = IDBPTransaction<AppDatabase, typeof stores, 'readwrite'>;
export const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
@Injectable({ providedIn: 'root' })
export class DailyTargetRepository {
  private readonly database = inject(Database);
  /** Commit notification only; consumers also read get(personId, date) on activation/reload. */
  readonly committed = signal<{ personId: UUID; date: LocalDate; version: number; today: boolean } | null>(null);
  async get(owner: UUID, date: LocalDate): Promise<DailyTargetSnapshot | null> {
    const values = await (await this.database.open()).getAllFromIndex('dailySnapshots', 'by-person-date', [owner, date]);
    if (values.length > 1 || values.some(value => !('schemaVersion' in value) || value.schemaVersion !== 2)) throw new StorageFailure('invalid', 'El día contiene un formato anterior o registros ambiguos; no se sobrescribirá.');
    return values[0] as DailyTargetSnapshot ?? null;
  }
  async draft(owner: UUID, date: LocalDate): Promise<ActivityDraft | null> {
    const draft = await (await this.database.open()).getFromIndex('drafts', 'by-editor', [owner, `activity:${date}`]);
    if (draft && draft.payload.kind !== 'daily-target') throw new StorageFailure('invalid', 'Borrador de formato anterior; no se sobrescribirá.');
    return draft as ActivityDraft ?? null;
  }
  async open(owner: UUID, date: LocalDate, catalog: MetCatalog): Promise<ActivityDraft> {
    localDate(date);
    return this.write(owner, true, async tx => {
      const draft = await tx.objectStore('drafts').index('by-editor').get([owner, `activity:${date}`]);
      if (draft) {
        if (draft.payload.kind !== 'daily-target') throw new StorageFailure('invalid', 'Borrador incompatible.');
        return this.currentContext(tx, owner, draft as ActivityDraft, catalog);
      }
      const base = await this.current(tx, owner, date);
      const context = base?.context ?? await this.context(tx, owner, catalog);
      const now = new Date().toISOString();
      const result: ActivityDraft = { id: newId(), personId: owner, editorKey: `activity:${date}`, createdAt: now, updatedAt: now,
        payload: { kind: 'daily-target', date, context, value: base ? structuredClone(base.activity) : initialActivity(context.profile), base } };
      await tx.objectStore('drafts').add(structuredClone(result)); return this.currentContext(tx, owner, result, catalog);
    });
  }
  async saveDraft(owner: UUID, draft: ActivityDraft, previous: ActivityDraft): Promise<void> {
    this.owned(owner, draft);
    if (draft.id !== previous.id || draft.editorKey !== previous.editorKey || !same(draft.payload.context, previous.payload.context) || !same(draft.payload.base, previous.payload.base)) throw new StorageFailure('invalid', 'El contexto capturado solo cambia mediante confirmación explícita.');
    await this.write(owner, false, async tx => {
      await this.check(tx, owner, previous);
      await tx.objectStore('drafts').put(structuredClone(draft));
    });
  }
  async save(owner: UUID, draft: ActivityDraft): Promise<DailyTargetSnapshot> {
    this.owned(owner, draft);
    const calculation = calculateActivity(draft.payload.value, draft.payload.context);
    const saved = await this.write(owner, true, async tx => {
      await this.check(tx, owner, draft);
      const person = (await tx.objectStore('people').get(owner))!;
      if (draft.payload.date >= today() && !same(person.profile, draft.payload.context.profile)) throw new StorageFailure('invalid', 'El perfil actual cambió. Actualiza el contexto y revisa el objetivo antes de guardar.');
      // Validate selected links against durable sessions, but never mutate actual session records.
      const value = draft.payload.value; const group = value.training.actual ?? value.training.forecast;
      if (value.mode === 'estimated') for (const block of group?.blocks ?? []) {
        if (!block.linkedTrainingSessionId) continue;
        const session = await tx.objectStore('trainingSessions').get([owner, block.linkedTrainingSessionId as UUID]);
        if (!session || session.status !== 'completed' || session.date !== draft.payload.date) throw new StorageFailure('invalid', 'La sesión vinculada ya no corresponde a esta persona y fecha. Revisa el vínculo.');
      }
      const base = draft.payload.base; const now = new Date().toISOString();
      const snapshot: DailyTargetSnapshot = { id: base?.id ?? newId(), personId: owner, createdAt: base?.createdAt ?? now, updatedAt: now,
        schemaVersion: 2, version: (base?.version ?? 0) + 1, date: draft.payload.date, context: structuredClone(draft.payload.context),
        activity: structuredClone(value), calculation };
      await tx.objectStore('drafts').delete([owner, draft.id]);
      await tx.objectStore('dailySnapshots').put(snapshot); return snapshot;
    });
    this.committed.set({ personId: owner, date: saved.date, version: saved.version, today: saved.date === today() }); return saved;
  }
  /** Explicit replacement of captured context; comparison guards a second tab racing the confirmation. */
  async refreshContext(owner: UUID, draft: ActivityDraft, catalog: MetCatalog): Promise<ActivityDraft> {
    this.owned(owner, draft);
    return this.write(owner, true, async tx => {
      await this.check(tx, owner, draft);
       const next = { ...structuredClone(draft), updatedAt: new Date().toISOString() }; const context = await this.context(tx, owner, catalog);
       next.payload.value = updatedProfileDefaults(next.payload.value, next.payload.context.profile, context.profile);
       next.payload.context = context;
      await tx.objectStore('drafts').put(next); return next;
    });
  }
  /** Caller shows local/remote values first. No last-write-wins overwrite of unseen records. */
  async recover(owner: UUID, previous: ActivityDraft | null, base: DailyTargetSnapshot | null, date: LocalDate, catalog: MetCatalog): Promise<ActivityDraft> {
    localDate(date);
    return this.write(owner, true, async tx => {
      const durable = await tx.objectStore('drafts').index('by-editor').get([owner, `activity:${date}`]) ?? null;
      const current = await this.current(tx, owner, date);
      if (!same(durable, previous) || !same(current, base)) throw new StorageFailure('conflict', 'La comparación cambió. Vuelve a revisar antes de recuperar.');
      if (durable?.payload.kind === 'daily-target' && same(durable.payload.base, current)) return this.currentContext(tx, owner, durable as ActivityDraft, catalog);
      const context = current?.context ?? await this.context(tx, owner, catalog); const now = new Date().toISOString();
      const next: ActivityDraft = { id: newId(), personId: owner, editorKey: `activity:${date}`, createdAt: now, updatedAt: now,
        payload: { kind: 'daily-target', date, base: current, context, value: current ? structuredClone(current.activity) : initialActivity(context.profile) } };
      if (durable) await tx.objectStore('drafts').delete([owner, durable.id]);
      await tx.objectStore('drafts').add(next); return this.currentContext(tx, owner, next, catalog);
    });
  }
  private async currentContext(tx: Transaction, owner: UUID, draft: ActivityDraft, catalog: MetCatalog): Promise<ActivityDraft> {
    if (draft.payload.date < today()) return draft;
    const person = (await tx.objectStore('people').get(owner))!;
    if (same(person.profile, draft.payload.context.profile)) return draft;
    const next = { ...structuredClone(draft), updatedAt: new Date().toISOString() }; const context = await this.context(tx, owner, catalog);
    next.payload.value = updatedProfileDefaults(next.payload.value, next.payload.context.profile, context.profile);
    next.payload.context = context;
    await tx.objectStore('drafts').put(next); return next;
  }
  private async context(tx: Transaction, owner: UUID, catalog: MetCatalog) {
    const person = (await tx.objectStore('people').get(owner))!;
    const revisions = await tx.objectStore('profileRevisions').index('by-person').getAll(owner);
    let revision = revisions.filter(value => same(value.profile, person.profile)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!revision) { const now = new Date().toISOString(); revision = { id: newId(), personId: owner, createdAt: now, updatedAt: now, profile: person.profile }; await tx.objectStore('profileRevisions').add(revision); }
    return capturedContext(revision, catalog);
  }
  private async current(tx: Transaction, owner: UUID, date: LocalDate): Promise<DailyTargetSnapshot | null> {
    const values = await tx.objectStore('dailySnapshots').index('by-person-date').getAll([owner, date]);
    if (values.length > 1 || values.some(value => !('schemaVersion' in value) || value.schemaVersion !== 2)) throw new StorageFailure('invalid', 'Formato de día incompatible o ambiguo.');
    return values[0] as DailyTargetSnapshot ?? null;
  }
  private owned(owner: UUID, draft: ActivityDraft): void {
    if (draft.personId !== owner || draft.editorKey !== `activity:${draft.payload.date}` || (draft.payload.base && (draft.payload.base.personId !== owner || draft.payload.base.date !== draft.payload.date))) throw new StorageFailure('invalid', 'El registro pertenece a otra persona o fecha.');
    localDate(draft.payload.date);
  }
  private async check(tx: Transaction, owner: UUID, draft: ActivityDraft): Promise<void> {
    if (!same(await tx.objectStore('drafts').get([owner, draft.id]) ?? null, draft) || !same(await this.current(tx, owner, draft.payload.date), draft.payload.base)) throw new StorageFailure('conflict', 'El borrador o el día guardado cambió. Compara antes de continuar.');
  }
  private async write<T>(owner: UUID, active: boolean, operation: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx = (await this.database.open()).transaction(stores, 'readwrite');
    try {
      const person = await tx.objectStore('people').get(owner); const settings = await tx.objectStore('settings').get('workspace');
      if (!person || person.archived || (active && (!settings?.mode || settings.activePersonId !== owner || (settings.mode === 'client' && settings.personalPersonId !== owner)))) throw new StorageFailure('invalid', 'Vuelve al espacio de esta persona para guardar.');
      const result = await operation(tx); await tx.done; return result;
    } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await tx.done.catch(() => undefined); throw storageFailure(error); }
  }
}
