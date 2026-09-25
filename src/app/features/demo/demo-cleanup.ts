import { Injectable, inject } from '@angular/core';
import type { IDBPTransaction } from 'idb';
import { PERSONAL_STORES, type AppDatabase } from '../../core/storage/database-schema';
import { Database, StorageFailure, storageFailure } from '../../core/storage/database';
import type { Draft } from '../../core/storage/draft.model';
import type { DailySnapshot } from '../activity/activity.model';
import type { DemoRecordIdentity, DemoSeedReceipt } from '../people/person.model';

const stores = ['settings', 'people', ...PERSONAL_STORES] as const;
type Transaction = IDBPTransaction<AppDatabase, typeof stores, 'readonly' | 'readwrite'>;
export interface DemoCleanupReview { fingerprint: string; edited: boolean; drafts: boolean; linked: boolean }

function matches(record: { id: string; personId: string; createdAt: string }, entry: DemoRecordIdentity, owner: string): boolean {
  return record.id === entry.id && record.personId === owner && record.createdAt === entry.createdAt;
}
function untouchedDayDraft(d: Draft, days: DailySnapshot[], receipt: DemoSeedReceipt): boolean {
  const payload = d.payload;
  if (d.personId !== receipt.personId || payload.kind !== 'daily-target' || !payload.base) return false;
  const base = days.find(day => 'schemaVersion' in day && matches(day, payload.base!, receipt.personId) && day.date === payload.date);
  return !!base && 'context' in base && receipt.snapshots.some(entry => matches(base, entry, receipt.personId)) &&
    JSON.stringify(payload.base) === JSON.stringify(base) &&
    JSON.stringify(payload.value) === JSON.stringify(base.activity) &&
    JSON.stringify(payload.context) === JSON.stringify(base.context);
}

async function inspect(tx: Transaction): Promise<{ review: DemoCleanupReview; receipt: DemoSeedReceipt }> {
  const settings = await tx.objectStore('settings').get('workspace');
  const receipt = settings?.demoSeed?.status === 'seeded' ? settings.demoSeed.receipt : undefined;
  if (!settings || !receipt) throw new StorageFailure('invalid', 'No hay datos demo identificados de forma segura para eliminar.');
  const [routines, meals, sessions, logs, snapshots, revisions, drafts, consumptions] = await Promise.all([
    tx.objectStore('routineRevisions').getAll(), tx.objectStore('mealPlanRevisions').getAll(),
    tx.objectStore('trainingSessions').getAll(), tx.objectStore('foodLogs').getAll(),
    tx.objectStore('dailySnapshots').getAll(), tx.objectStore('profileRevisions').getAll(), tx.objectStore('drafts').getAll(),
    tx.objectStore('mealConsumptions').getAll(),
  ]);
  const owner = receipt.personId;
  const routine = routines.filter(row => row.personId === owner && row.planId === receipt.routine.planId);
  const meal = meals.filter(row => row.personId === owner && row.planId === receipt.mealPlan.planId);
  const pick = <T extends { id: string; personId: string; createdAt: string }>(rows: T[], ids: DemoRecordIdentity[]) =>
    rows.filter(row => ids.some(entry => matches(row, entry, owner)));
  // Reused IDs with different creation times are not proof of seed ownership.
  for (const [rows, ids] of [[sessions, receipt.sessions], [logs, receipt.foodLogs], [snapshots, receipt.snapshots],
    [revisions, [receipt.profileRevision]]] as const) {
    if (rows.some(row => row.personId === owner && ids.some(entry => entry.id === row.id && entry.createdAt !== row.createdAt)))
      throw new StorageFailure('conflict', 'Una identidad demo cambió. No se eliminaron datos; revisa la copia completa.');
  }
  for (const [rows, plan] of [[routine, receipt.routine], [meal, receipt.mealPlan]] as const) {
    if (rows.some(row => row.id === plan.revision.id && row.createdAt !== plan.revision.createdAt))
      throw new StorageFailure('conflict', 'La identidad del plan demo cambió. No se eliminaron datos.');
  }
  const selected = { routine, meal, sessions: pick(sessions, receipt.sessions), foodLogs: pick(logs, receipt.foodLogs),
    snapshots: pick(snapshots, receipt.snapshots), revision: pick(revisions, [receipt.profileRevision]) };
  const untouchedDayDrafts = drafts.filter(d => untouchedDayDraft(d, selected.snapshots, receipt));
  const pending = drafts.some(d => {
    if (d.personId !== owner) return false;
    if (untouchedDayDrafts.some(item => item.id === d.id)) return false;
    const payload = d.payload;
    return payload.kind === 'routine' && payload.planId === receipt.routine.planId ||
      payload.kind === 'meal-plan' && payload.planId === receipt.mealPlan.planId ||
      payload.kind === 'training' && receipt.sessions.some(entry => entry.id === payload.session.id) ||
      payload.kind === 'daily-target' && selected.snapshots.some(row => row.date === payload.date) ||
      payload.kind === 'food-diary' && !!payload.edit && receipt.foodLogs.some(entry => entry.id === payload.edit!.base.id);
  });
  // Seed sessions are started at local noon and completed one hour later; a saved correction increments version.
  const edited = routine.length > 1 || meal.length > 1 || [...routine, ...meal].some(row => row.archived || row.updatedAt !== row.createdAt) ||
    selected.sessions.some(row => row.version !== 1 || row.status !== 'completed' ||
      row.completedAt !== new Date(Date.parse(row.createdAt) + 60 * 60 * 1000).toISOString() || row.updatedAt !== row.completedAt) ||
    [...selected.foodLogs, ...selected.snapshots].some(row => row.updatedAt !== row.createdAt);
  const linked = snapshots.some(day => day.personId === owner && !selected.snapshots.some(entry => entry.id === day.id) &&
    'activity' in day && 'mode' in day.activity && [day.activity.training.actual, day.activity.training.forecast]
      .some(group => group?.blocks.some(block => selected.sessions.some(session => session.id === block.linkedTrainingSessionId)))) ||
    consumptions.some(receipt => receipt.personId === owner && receipt.foodLogIds.some(id => selected.foodLogs.some(log => log.id === id)));
  return { receipt, review: { fingerprint: JSON.stringify({ receipt, mode: settings.mode, active: settings.activePersonId,
    last: settings.lastTrainerPersonId, selected, untouchedDayDrafts }), edited, drafts: pending, linked } };
}

@Injectable({ providedIn: 'root' })
export class DemoCleanup {
  private readonly database = inject(Database);

  async review(): Promise<DemoCleanupReview> {
    const tx = (await this.database.open()).transaction(stores, 'readonly');
    const result = await inspect(tx); await tx.done;
    return result.review;
  }

  async clear(expected: DemoCleanupReview): Promise<void> {
    const tx = (await this.database.open()).transaction(stores, 'readwrite');
    try {
      const { review, receipt } = await inspect(tx);
      if (review.fingerprint !== expected.fingerprint || review.drafts || expected.drafts || review.linked || expected.linked)
        throw new StorageFailure('conflict', 'Los datos demo cambiaron o están vinculados a registros nuevos. Revisa los vínculos y borradores antes de eliminar.');
      const owner = receipt.personId;
      const currentDrafts = await tx.objectStore('drafts').index('by-person').getAll(owner);
      const currentDays = await tx.objectStore('dailySnapshots').index('by-person').getAll(owner);
      for (const d of currentDrafts) if (untouchedDayDraft(d, currentDays, receipt))
        await tx.objectStore('drafts').delete([owner, d.id]);
      for (const row of await tx.objectStore('routineRevisions').index('by-person').getAll(owner))
        if (row.planId === receipt.routine.planId) await tx.objectStore('routineRevisions').delete([owner, row.id]);
      for (const row of await tx.objectStore('mealPlanRevisions').index('by-person').getAll(owner))
        if (row.planId === receipt.mealPlan.planId) await tx.objectStore('mealPlanRevisions').delete([owner, row.id]);
      for (const [store, ids] of [['trainingSessions', receipt.sessions], ['foodLogs', receipt.foodLogs],
        ['dailySnapshots', receipt.snapshots]] as const) {
        for (const entry of ids) {
          const row = await tx.objectStore(store).get([owner, entry.id]);
          if (row && matches(row, entry, owner)) await tx.objectStore(store).delete([owner, entry.id]);
        }
      }
      // A later real day/draft may still depend on the captured profile revision.
      const days = await tx.objectStore('dailySnapshots').index('by-person').getAll(owner);
      const drafts = await tx.objectStore('drafts').index('by-person').getAll(owner);
      const referenced = days.some(day => 'context' in day && day.context.profileRevisionId === receipt.profileRevision.id) ||
        drafts.some(d => d.payload.kind === 'daily-target' && d.payload.context.profileRevisionId === receipt.profileRevision.id);
      const revision = await tx.objectStore('profileRevisions').get([owner, receipt.profileRevision.id]);
      if (!referenced && revision && matches(revision, receipt.profileRevision, owner))
        await tx.objectStore('profileRevisions').delete([owner, revision.id]);
      const settings = (await tx.objectStore('settings').get('workspace'))!;
      if (receipt.trainerPersonId) {
        const person = await tx.objectStore('people').get(owner);
        let hasOtherRecords = false;
        for (const store of PERSONAL_STORES) if (await tx.objectStore(store).index('by-person').count(owner)) hasOtherRecords = true;
        if (!hasOtherRecords && person?.createdAt === receipt.trainerPersonCreatedAt && person.updatedAt === person.createdAt) {
          await tx.objectStore('people').delete(owner);
          if (settings.activePersonId === owner) settings.activePersonId = settings.personalPersonId;
          if (settings.lastTrainerPersonId === owner) settings.lastTrainerPersonId = settings.personalPersonId;
        }
      }
      settings.demoSeed = { version: 1, status: 'cleared', receipt };
      await tx.objectStore('settings').put(settings);
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted. */ }
      await tx.done.catch(() => undefined);
      throw storageFailure(error);
    }
  }
}
