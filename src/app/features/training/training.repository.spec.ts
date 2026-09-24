import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { localDate, newId, type UUID } from '../../core/domain/identity';
import { PeopleRepository } from '../people/people.repository';
import { emptyProfile } from '../people/person.model';
import { RoutinesRepository } from '../routines/routines.repository';
import { routineDraft } from '../routines/routine.fixtures';
import { TrainingRepository, type TrainingDraft } from './training.repository';
import { performed } from './training.fixtures';
import { frozenSession, skipSet } from './training-domain';

describe('atomic actual session repository', () => {
  let database: Database; let repository: TrainingRepository; let routines: RoutinesRepository; let people: PeopleRepository; let owner: UUID;
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `training-${newId()}` }] });
    database = TestBed.inject(Database); repository = TestBed.inject(TrainingRepository); routines = TestBed.inject(RoutinesRepository); people = TestBed.inject(PeopleRepository);
    owner = (await people.load()).settings.personalPersonId; await people.chooseMode('trainer');
  });
  afterEach(async () => { vi.restoreAllMocks(); database.close(); await deleteDB(database.name); });
  async function start(person = owner) {
    const plan = routineDraft(person); await routines.saveDraft(person, plan, null); const revision = await routines.save(person, plan); const week = revision.content.weeks[0];
    return { revision, draft: await repository.start(person, revision.id, week.id, week.days[0].id, localDate('2026-01-01')) };
  }
  async function fill(draft: TrainingDraft) { const next = structuredClone(draft); next.payload.session = performed(draft.payload.session); await repository.saveDraft(draft.personId, next, draft); return next; }
  it('recovers start without performance writes and commits once with stable identity/date and duration metadata', async () => {
    const { draft } = await start(); database.close(); expect(await repository.listDrafts(owner)).toEqual([draft]); expect(await repository.list(owner)).toEqual([]);
    const filled = await fill(draft); const saved = await repository.save(owner, filled); database.close();
    expect(await repository.list(owner)).toEqual([saved]); expect(saved).toMatchObject({ id: draft.payload.session.id, date: '2026-01-01', version: 1, status: 'completed', durationMinutes: 40, durationSource: 'manual' });
    expect(saved.completedAt).toBeTruthy(); expect(await repository.listDrafts(owner)).toEqual([]);
    await expect(repository.save(owner, filled)).rejects.toMatchObject({ code: 'conflict' });
    const db = await database.open(); expect(db.objectStoreNames).toHaveLength(13); expect(await db.count('dailySnapshots')).toBe(0);
    expect(await db.getAllFromIndex('trainingSessions', 'by-person-exercise', saved.personExerciseKeys[0])).toEqual([saved]);
  });
  it('keeps frozen planned history after later routine edits and archive', async () => {
    const { draft, revision } = await start(); const frozen = frozenSession(draft.payload.session);
    const plan = routineDraft(owner, revision.planId, revision.id); plan.payload.content = structuredClone(revision.content); plan.payload.name = 'New name';
    plan.payload.content.weeks[0].days[0].exercises[0].exercise.name = 'New catalog snapshot';
    const set = plan.payload.content.weeks[0].days[0].exercises[0].sets[0]; if (set.type === 'weight-reps') set.weightKg = 99;
    await routines.saveDraft(owner, plan, null); const later = await routines.save(owner, plan); await routines.setArchived(owner, later, true);
    const saved = await repository.save(owner, await fill(draft)); expect(frozenSession(saved)).toEqual(frozen);
    expect(saved.source?.revisionId).toBe(revision.id); expect(saved.exercises[0].sets[0].actual).toMatchObject({ weightKg: 12.5 });
  });
  it('rejects changes to the frozen snapshot even from a valid owner', async () => {
    const { draft } = await start(); const changed = structuredClone(draft); changed.payload.session.exercises[0].exercise.instruction = 'Changed';
    await expect(repository.saveDraft(owner, changed, draft)).rejects.toMatchObject({ code: 'invalid' }); expect(await repository.listDrafts(owner)).toEqual([draft]);
  });
  it('retains invalid unfinished sets as drafts; permits explicit partial completion', async () => {
    const { draft } = await start(); await expect(repository.save(owner, draft)).rejects.toMatchObject({ code: 'invalid' });
    const filled = await fill(draft); const partial = structuredClone(filled); partial.payload.session.exercises[1].sets[0] = skipSet(partial.payload.session.exercises[1].sets[0]);
    await repository.saveDraft(owner, partial, filled); const saved = await repository.save(owner, partial);
    expect(saved.exercises[1].sets[0]).toMatchObject({ status: 'skipped', actual: null, rpe: null });
  });
  it('atomically rolls back draft deletion and previous session on write failure', async () => {
    const { draft } = await start(); const saved = await repository.save(owner, await fill(draft)); const correction = await repository.reopen(owner, saved.id);
    const original = IDBObjectStore.prototype.put;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'trainingSessions') throw new DOMException('Full', 'QuotaExceededError'); return original.call(this, value, key);
    });
    await expect(repository.save(owner, correction)).rejects.toMatchObject({ code: 'quota' });
    expect(await repository.get(owner, saved.id)).toEqual(saved); expect(await repository.listDrafts(owner)).toEqual([correction]);
    fail.mockRestore(); const updated = await repository.save(owner, correction); expect(updated.id).toBe(saved.id); expect(updated.version).toBe(2);
  });
  it('checks full saved base and durable draft, rejecting equal-timestamp and concurrent writes', async () => {
    const { draft } = await start(); const filled = await fill(draft); const changed = structuredClone(filled); changed.payload.session.notes = 'Remote';
    await repository.saveDraft(owner, changed, filled);
    await expect(repository.saveDraft(owner, filled, filled)).rejects.toMatchObject({ code: 'conflict' });
    await expect(repository.save(owner, filled)).rejects.toMatchObject({ code: 'conflict' });
    const results = await Promise.allSettled([repository.save(owner, changed), repository.save(owner, changed)]);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const saved = (await repository.list(owner))[0]; const correction = await repository.reopen(owner, saved.id);
    const remote = { ...saved, notes: 'Concurrent saved correction' }; await (await database.open()).put('trainingSessions', remote);
    await expect(repository.save(owner, correction)).rejects.toMatchObject({ code: 'conflict' }); expect(await repository.get(owner, saved.id)).toEqual(remote);
  });
  it('preserves prescribed history and ID while intentionally correcting actual values', async () => {
    const { draft } = await start(); const saved = await repository.save(owner, await fill(draft));
    const correction = await repository.reopen(owner, saved.id); const changed = structuredClone(correction);
    const actual = changed.payload.session.exercises[0].sets[0].actual; if (actual?.type === 'weight-reps') actual.weightKg = 15.25;
    await repository.saveDraft(owner, changed, correction); const updated = await repository.save(owner, changed);
    expect(updated.id).toBe(saved.id); expect(updated.date).toBe(saved.date); expect(updated.startedAt).toBe(saved.startedAt); expect(updated.completedAt).toBe(saved.completedAt);
    expect(frozenSession(updated)).toEqual(frozenSession(saved)); expect(updated.exercises[0].sets[0].actual).toMatchObject({ weightKg: 15.25 }); expect(await repository.list(owner)).toHaveLength(1);
  });
  it('isolates same-name people and rejects wrong owner, active person and client-mode commits', async () => {
    const a = newId(); const b = newId(); for (const id of [a, b]) await people.savePerson(id, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null);
    await people.selectPerson(a); const { draft, revision } = await start(a); const filled = await fill(draft);
    await expect(repository.saveDraft(b, filled, filled)).rejects.toMatchObject({ code: 'invalid' });
    await people.selectPerson(b); await expect(repository.save(a, filled)).rejects.toMatchObject({ code: 'invalid' });
    await expect(repository.start(b, revision.id, revision.content.weeks[0].id, revision.content.weeks[0].days[0].id, localDate('2026-01-01'))).rejects.toMatchObject({ code: 'invalid' });
    expect(await repository.listDrafts(b)).toEqual([]); expect(await repository.get(b, draft.payload.session.id)).toBeNull();
    await people.selectPerson(a); await people.chooseMode('client'); await expect(repository.save(a, filled)).rejects.toMatchObject({ code: 'invalid' });
    await people.chooseMode('trainer'); await repository.save(a, filled); expect(await repository.list(b)).toEqual([]);
  });
});
