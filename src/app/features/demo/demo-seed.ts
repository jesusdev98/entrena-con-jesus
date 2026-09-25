import type { IDBPTransaction } from 'idb';
import { newId, type UUID } from '../../core/domain/identity';
import { PERSONAL_STORES, type AppDatabase } from '../../core/storage/database-schema';
import { Database, StorageFailure, storageFailure } from '../../core/storage/database';
import { today } from '../activity/daily-target.model';
import { emptyProfile, type AppMode, type DemoSeedReceipt, type Person, type PersonFormValue } from '../people/person.model';
import type { BackupPayload } from '../transfers/transfer.model';
import { buildDemoData, loadDemoCatalogs, validateDemoPayload } from './demo-data';

const stores = ['settings', 'people', ...PERSONAL_STORES] as const;
type Transaction = IDBPTransaction<AppDatabase, typeof stores, 'readwrite' | 'readonly'>;

async function virgin(tx: Transaction, personal: Person, draft?: { personId: UUID; id: UUID }): Promise<boolean> {
  if (personal.kind !== 'personal' || personal.archived || personal.displayName !== 'Mi espacio' || personal.reference !== '' ||
    JSON.stringify(personal.profile) !== JSON.stringify(emptyProfile())) return false;
  if (await tx.objectStore('people').count() !== 1) return false;
  for (const name of PERSONAL_STORES) {
    if (name === 'drafts') {
      const drafts = await tx.objectStore('drafts').getAll();
      if (drafts.some(item => !draft || item.id !== draft.id || item.personId !== personal.id ||
        item.payload.kind !== 'person' || item.payload.subjectId !== personal.id || item.payload.baseUpdatedAt !== personal.updatedAt)) return false;
    } else if (await tx.objectStore(name).count()) return false;
  }
  return !draft || draft.personId === personal.id;
}

/** The only onboarding write boundary; IDB serializes all tabs on the same store set. */
export async function finishOnboarding(database: Database, id: UUID, value: PersonFormValue,
  baseUpdatedAt: string | null, draft: { personId: UUID; id: UUID } | undefined, mode: AppMode): Promise<void> {
  // A preflight is only an optimization. Every eligibility fact is checked again inside the write transaction.
  const db = await database.open();
  const preflight = db.transaction(stores, 'readonly');
  const before = await preflight.objectStore('settings').get('workspace');
  const initial = await preflight.objectStore('people').get(id);
  const empty = !!initial && before?.demoSeed?.status === 'eligible' && before.mode === null &&
    await virgin(preflight, initial, draft);
  await preflight.done;
  const catalogs = empty ? await loadDemoCatalogs() : null;
  if (!initial || initial.updatedAt !== baseUpdatedAt) throw new StorageFailure('conflict', 'El perfil cambió en otra pestaña. Conserva el borrador y vuelve a revisarlo.');
  const now = new Date().toISOString();
  const updatedAt = now <= initial.updatedAt ? new Date(Date.parse(initial.updatedAt) + 1).toISOString() : now;
  const saved: Person = { ...initial, ...value, updatedAt };
  const target: Person = mode === 'trainer' && catalogs ? { id: newId(), kind: 'client', displayName: 'Usuario de prueba',
    reference: 'Demo', archived: false, createdAt: now, updatedAt: now,
    profile: { ...emptyProfile(), age: 32, formulaSex: 'male', heightCm: 176, weightKg: 78,
      goal: 'maintenance', adjustmentKcal: 0 } } : saved;
  const demo = catalogs ? buildDemoData(target, catalogs, today()) : null;
  const identity = (record: { id: UUID; createdAt: string }) => ({ id: record.id, createdAt: record.createdAt });
  const receipt: DemoSeedReceipt | null = demo ? {
    personId: target.id, trainerPersonId: target.id === id ? null : target.id,
    trainerPersonCreatedAt: target.id === id ? null : target.createdAt,
    profileRevision: identity(demo.profileRevision),
    routine: { planId: demo.routine.planId, revision: identity(demo.routine) },
    mealPlan: { planId: demo.mealPlan.planId, revision: identity(demo.mealPlan) },
    sessions: demo.sessions.map(identity), foodLogs: demo.foodLogs.map(identity), snapshots: demo.snapshots.map(identity),
  } : null;
  const revision = { id: newId(), personId: id, createdAt: now, updatedAt: now, profile: value.profile };
  if (demo && before) {
    const payload: BackupPayload = { settings: [{ ...before, mode, activePersonId: target.id, lastTrainerPersonId: target.id,
      demoSeed: { version: 1, status: 'seeded', receipt: receipt! } }], people: target.id === id ? [saved] : [saved, target],
      profileRevisions: target.id === id ? [revision] : [revision, demo.profileRevision], customExercises: [], customFoods: [],
      routineRevisions: [demo.routine], mealPlanRevisions: [demo.mealPlan], trainingSessions: demo.sessions,
      foodLogs: demo.foodLogs, dailySnapshots: demo.snapshots, mealConsumptions: [], drafts: [], externalSubjects: [] };
    validateDemoPayload(payload);
  }
  const tx = db.transaction(stores, 'readwrite');
  try {
    const settings = await tx.objectStore('settings').get('workspace');
    const personal = await tx.objectStore('people').get(id);
    if (!settings || settings.mode !== null || id !== settings.personalPersonId || !personal ||
      personal.updatedAt !== baseUpdatedAt) throw new StorageFailure('conflict', 'La configuración inicial cambió en otra pestaña. Conserva el borrador y vuelve a revisarlo.');
    if (draft) {
      const stored = await tx.objectStore('drafts').get([draft.personId, draft.id]);
      if (stored && (draft.personId !== id || stored.payload.kind !== 'person' || stored.payload.subjectId !== id))
        throw new StorageFailure('invalid', 'El borrador no corresponde a este perfil.');
    }
    const eligible = empty && settings.demoSeed?.version === 1 && settings.demoSeed.status === 'eligible' &&
      await virgin(tx, personal, draft);
    if (eligible && !demo) throw new StorageFailure('conflict', 'El espacio cambió mientras se preparaba la demostración. Conserva el borrador y vuelve a intentarlo.');
    const nextSettings = { ...settings, mode, activePersonId: eligible ? target.id : id, lastTrainerPersonId: mode === 'trainer' && eligible ? target.id : id,
      demoSeed: { version: 1 as const, status: eligible ? 'seeded' as const :
        settings.demoSeed?.status === 'seeded' ? 'seeded' as const : 'ineligible' as const,
        ...(eligible && receipt ? { receipt } : {}) } };
    // Once the first request is queued, every subsequent request belongs to the same atomic transaction.
    // Attach handlers immediately so an abort cannot produce stray unhandled rejections.
    const writes: Promise<unknown>[] = [];
    const queue = (request: Promise<unknown>) => { void request.catch(() => undefined); writes.push(request); };
    queue(tx.objectStore('people').put(saved));
    queue(tx.objectStore('profileRevisions').add(revision));
    if (draft) queue(tx.objectStore('drafts').delete([draft.personId, draft.id]));
    if (eligible && demo) {
      if (target.id !== id) queue(tx.objectStore('people').add(target));
      if (target.id !== id) queue(tx.objectStore('profileRevisions').add(demo.profileRevision));
      queue(tx.objectStore('routineRevisions').add(demo.routine));
      queue(tx.objectStore('mealPlanRevisions').add(demo.mealPlan));
      for (const session of demo.sessions) queue(tx.objectStore('trainingSessions').add(session));
      for (const log of demo.foodLogs) queue(tx.objectStore('foodLogs').add(log));
      for (const snapshot of demo.snapshots) queue(tx.objectStore('dailySnapshots').add(snapshot));
    }
    queue(tx.objectStore('settings').put(nextSettings));
    await Promise.all(writes);
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch { /* Already aborted. */ }
    await tx.done.catch(() => undefined);
    throw storageFailure(error);
  }
}
