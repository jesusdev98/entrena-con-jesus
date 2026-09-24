import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { localDate, newId, type UUID } from '../../core/domain/identity';
import { PeopleRepository } from '../people/people.repository';
import { emptyProfile, type PersonProfile } from '../people/person.model';
import { sessionFixture } from '../training/training.fixtures';
import { actualActivity, activityCatalog, activityProfile } from './activity.fixtures';
import { DailyTargetRepository } from './daily-target.repository';
import { today } from './daily-target.model';

describe('atomic daily target persistence', () => {
  let database: Database, repository: DailyTargetRepository, people: PeopleRepository, owner: UUID;
  const past = localDate('2026-01-01');
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `activity-${newId()}` }] });
    database = TestBed.inject(Database); repository = TestBed.inject(DailyTargetRepository); people = TestBed.inject(PeopleRepository);
    owner = (await people.load()).settings.personalPersonId; await people.chooseMode('trainer'); await profile(activityProfile());
  });
  afterEach(async () => { vi.restoreAllMocks(); database.close(); await deleteDB(database.name); });
  async function profile(value: PersonProfile) {
    const person = (await people.load()).people.find(p => p.id === owner)!;
    await people.savePerson(owner, { displayName: person.displayName, reference: '', profile: value }, person.updatedAt);
  }
  async function filled(date = past) {
    const draft = await repository.open(owner, date, activityCatalog), next = structuredClone(draft); next.payload.value = actualActivity();
    await repository.saveDraft(owner, next, draft); return next;
  }
  it('commits full payload and deletes the draft atomically, retaining 13 stores and reload identity', async () => {
    const draft = await filled(), saved = await repository.save(owner, draft); database.close();
    expect(await repository.get(owner, past)).toEqual(saved); expect(await repository.draft(owner, past)).toBeNull();
    expect(saved).toMatchObject({ schemaVersion: 2, version: 1, personId: owner, date: past, activity: { goal: 'loss', adjustmentKcal: 300 }, calculation: { result: { expenditure: { provisional: true, restingFormula: 'revised-harris-benedict-1984' } } } });
    expect(saved.context.profileRevisionId).toBeTruthy(); expect(saved.context.catalog.entries).toHaveLength(31);
    expect((await database.open()).objectStoreNames).toHaveLength(13);
    expect(repository.committed()).toMatchObject({ personId: owner, date: past, version: 1, today: false });
    await expect(repository.save(owner, draft)).rejects.toMatchObject({ code: 'conflict' });
  });
  it('rolls back snapshot failure after draft deletion, including previous saved result', async () => {
    const saved = await repository.save(owner, await filled()), draft = await repository.open(owner, past, activityCatalog);
    const original = IDBObjectStore.prototype.put;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'dailySnapshots') throw new DOMException('Full', 'QuotaExceededError'); return original.call(this, value, key);
    });
    await expect(repository.save(owner, draft)).rejects.toMatchObject({ code: 'quota' });
    expect(await repository.get(owner, past)).toEqual(saved); expect(await repository.draft(owner, past)).toEqual(draft);
    fail.mockRestore(); expect((await repository.save(owner, draft)).version).toBe(2);
  });
  it('rejects full durable draft differences even with identical timestamps and permits one concurrent commit', async () => {
    const draft = await filled(), changed = structuredClone(draft); changed.payload.value.adjustmentKcal = 450;
    await repository.saveDraft(owner, changed, draft); await expect(repository.save(owner, draft)).rejects.toMatchObject({ code: 'conflict' });
    const results = await Promise.allSettled([repository.save(owner, changed), repository.save(owner, changed)]);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  });
  it('compares the full saved base and rejects unseen recovery races', async () => {
    const saved = await repository.save(owner, await filled()), draft = await repository.open(owner, past, activityCatalog);
    const remote = structuredClone(saved); remote.activity.adjustmentKcal = 123;
    await (await database.open()).put('dailySnapshots', remote);
    await expect(repository.save(owner, draft)).rejects.toMatchObject({ code: 'conflict' });
    await expect(repository.recover(owner, draft, saved, past, activityCatalog)).rejects.toMatchObject({ code: 'conflict' });
    const recovered = await repository.recover(owner, draft, remote, past, activityCatalog);
    expect(recovered.payload.value.adjustmentKcal).toBe(123); expect((await repository.save(owner, recovered)).version).toBe(2);
  });
  it('rejects owner/date/context tampering and isolates same-name people and modes', async () => {
    const draft = await filled(), other = newId(); await people.savePerson(other, { displayName: 'Mi espacio', reference: '', profile: emptyProfile() }, null);
    await expect(repository.saveDraft(other, draft, draft)).rejects.toMatchObject({ code: 'invalid' });
    const changed = structuredClone(draft); changed.payload.context.profile.weightKg = 99;
    await expect(repository.saveDraft(owner, changed, draft)).rejects.toMatchObject({ code: 'invalid' });
    await people.selectPerson(other); await expect(repository.save(owner, draft)).rejects.toMatchObject({ code: 'invalid' });
    const otherDraft = await repository.open(other, past, activityCatalog); expect(otherDraft.payload.value.totalSteps.actual).toBeUndefined();
    await people.chooseMode('client'); await expect(repository.save(other, otherDraft)).rejects.toThrow();
    expect(await repository.get(other, past)).toBeNull(); expect(await repository.draft(owner, past)).toEqual(draft);
  });
  it('preserves past snapshots and captured sources after profile/catalog changes and explicit historical edits', async () => {
    const saved = await repository.save(owner, await filled()); await profile({ ...activityProfile(), weightKg: 100 });
    const changedCatalog = structuredClone(activityCatalog); changedCatalog.entries = [];
    const draft = await repository.open(owner, past, changedCatalog);
    expect(draft.payload.context).toEqual(saved.context); expect(await repository.get(owner, past)).toEqual(saved);
    const changed = structuredClone(draft); changed.payload.value.adjustmentKcal = 450;
    expect(changed.payload.base).toEqual(draft.payload.base);
    await repository.saveDraft(owner, changed, draft); const correction = await repository.save(owner, changed);
    expect(correction.context).toEqual(saved.context); expect(correction.calculation.result.expenditure).toEqual(saved.calculation.result.expenditure);
    expect(correction.id).toBe(saved.id); expect(correction.calculation.result.targetKcal).toBeCloseTo(2569.965432098765, 6);
  });
  it('changes historical context only through an explicit, guarded refresh', async () => {
    const saved = await repository.save(owner, await filled()), draft = await repository.open(owner, past, activityCatalog);
    await profile({ ...activityProfile(), weightKg: 100 }); const refreshed = await repository.refreshContext(owner, draft, activityCatalog);
    expect(refreshed.payload.context.profile.weightKg).toBe(100); expect(await repository.get(owner, past)).toEqual(saved);
    await expect(repository.refreshContext(owner, draft, activityCatalog)).rejects.toMatchObject({ code: 'conflict' });
    expect((await repository.save(owner, refreshed)).calculation.result.targetKcal).not.toBe(saved.calculation.result.targetKcal);
  });
  it.each([today(), localDate('2099-01-01')])('applies current profile to %s on reopen without silently publishing', async date => {
    const draft = await filled(date), saved = await repository.save(owner, draft);
    await profile({ ...activityProfile(), weightKg: 90, macros: { protein: 30, carbohydrate: 40, fat: 30 } });
    const reopened = await repository.open(owner, date, activityCatalog);
    expect(reopened.payload.context.profile.weightKg).toBe(90); expect(reopened.payload.value.work.actual).toEqual(draft.payload.value.work.actual);
    expect(reopened.payload.value.macros.protein).toBe(30); expect(reopened.payload.value.adjustmentKcal).toBe(300);
    expect(await repository.get(owner, date)).toEqual(saved); expect((await repository.save(owner, reopened)).calculation.result.targetKcal).not.toBe(saved.calculation.result.targetKcal);
  });
  it('blocks a stale current-day profile at commit and permits explicit refresh with local edits intact', async () => {
    const draft = await filled(today()); await profile({ ...activityProfile(), weightKg: 95 });
    await expect(repository.save(owner, draft)).rejects.toThrow(/perfil actual cambió/);
    const refreshed = await repository.refreshContext(owner, draft, activityCatalog); expect(refreshed.payload.value).toEqual(draft.payload.value);
    await repository.save(owner, refreshed); expect(repository.committed()?.today).toBe(true);
  });
  it('validates completed session links durably without recalculating their typed duration from sets', async () => {
    const draft = await filled(), session = { ...sessionFixture(owner), status: 'completed' as const, durationMinutes: 999 };
    draft.payload.value.training.actual!.blocks[0].linkedTrainingSessionId = session.id;
    const previous = (await repository.draft(owner, past))!; await repository.saveDraft(owner, draft, previous);
    await expect(repository.save(owner, draft)).rejects.toMatchObject({ code: 'invalid' });
    await (await database.open()).put('trainingSessions', session);
    const saved = await repository.save(owner, draft);
    expect(saved.activity.training.actual!.blocks[0].minutes).toBe(60);
    expect(await (await database.open()).get('trainingSessions', [owner, session.id])).toEqual(session);
  });
  it('retains invalid input as a recoverable draft without publishing any target', async () => {
    const draft = await filled(); draft.payload.value.work.actual!.includedSteps = 9000;
    await repository.saveDraft(owner, draft, (await repository.draft(owner, past))!);
    await expect(repository.save(owner, draft)).rejects.toThrow(/pasos totales/);
    database.close(); expect(await repository.draft(owner, past)).toEqual(draft); expect(await repository.get(owner, past)).toBeNull();
  });
});
