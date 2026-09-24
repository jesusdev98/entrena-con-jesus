import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { localDate, newId, type UUID } from '../../core/domain/identity';
import { PeopleRepository } from '../people/people.repository';
import { emptyProfile } from '../people/person.model';
import { exerciseFixture } from '../exercises/exercise.fixtures';
import { performed, sessionFixture } from '../training/training.fixtures';
import type { TrainingSession } from '../training/training.model';
import type { FoodLog } from '../nutrition/nutrition.model';
import { ProgressExchange } from './progress-exchange';
import { parseProgressFile } from './progress-schema';
import { MAX_PLAN_BYTES } from './transfer-schema';
import { weekSessions } from '../progress/training-history';
import { intake } from '../nutrition/diary/diary.model';

const exercises = [exerciseFixture()], foods: never[] = [];
const databases: Database[] = [];
async function device(mode: 'trainer' | 'client') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `progress-${newId()}` }] });
  const db = TestBed.inject(Database); databases.push(db);
  const people = TestBed.inject(PeopleRepository), exchange = TestBed.inject(ProgressExchange);
  const owner = (await people.load()).settings.personalPersonId;
  await people.chooseMode(mode);
  return { db, people, exchange, owner };
}
afterEach(async () => { vi.restoreAllMocks(); for (const db of databases.splice(0)) { db.close(); await deleteDB(db.name); } });
function actual(owner: UUID): TrainingSession {
  const row = performed(sessionFixture(owner));
  row.exercises[1].exercise.exerciseId = newId(); row.exercises[2].exercise.exerciseId = newId();
  row.personExerciseKeys = row.exercises.map(item => `${owner}:${item.exercise.exerciseId}`);
  return { ...row, status: 'completed', version: 1, completedAt: '2026-01-01T12:40:00Z', updatedAt: '2026-01-01T12:41:00Z', durationSource: 'manual' };
}
function meal(owner: UUID): FoodLog {
  const id = newId();
  return { id: newId(), personId: owner, createdAt: '2026-01-01T12:00:00Z', updatedAt: '2026-01-01T12:00:00Z',
    date: localDate('2026-01-01'), mealLabel: 'Almuerzo', food: { foodId: id, name: 'Receta propia',
      per100g: { kcal: 150, protein: 10, carbohydrate: 20, fat: 4 }, source: { customFoodId: id } }, grams: 120, source: null };
}

describe('actual progress exchange across isolated databases', () => {
  it('round-trips only completed actuals into one explicitly mapped same-name client, and repeats without duplicates', async () => {
    const trainer = await device('trainer');
    const a = newId(), b = newId();
    for (const id of [a, b]) await trainer.people.savePerson(id, { displayName: 'Alex', reference: id.slice(0, 6), profile: emptyProfile() }, null);
    await trainer.people.selectPerson(a);
    const client = await device('client');
    const session = actual(client.owner), log = meal(client.owner);
    const db = await client.db.open();
    await db.put('trainingSessions', session); await db.put('foodLogs', log);
    await db.put('trainingSessions', { ...actual(client.owner), status: 'draft' });
    const text = await client.exchange.export(client.owner, localDate('2026-01-01'), localDate('2026-01-07'), exercises, foods);
    const file = parseProgressFile(text);
    expect(file.payload.sessions).toHaveLength(1); expect(file.payload.foodLogs).toHaveLength(1);
    expect(text).not.toContain('test-bench-press-3.svg');
    expect(file.payload.sessions[0].exercises[0].sets[0].status).toBe('completed');
    const first = await trainer.exchange.review(text, a, exercises, foods);
    expect(first.records.map(item => item.status)).toEqual(['added', 'added']);
    expect(await (await trainer.db.open()).getAll('externalSubjects')).toEqual([]);
    await trainer.exchange.apply(first, {});
    const savedSessions = await (await trainer.db.open()).getAllFromIndex('trainingSessions', 'by-person', a);
    const savedLogs = await (await trainer.db.open()).getAllFromIndex('foodLogs', 'by-person', a);
    expect(weekSessions(savedSessions, a, localDate('2026-01-01'))).toHaveLength(1);
    expect(savedSessions[0].exercises[0].sets[0]).toMatchObject({ actual: { weightKg: 12.5, reps: 9, rir: 1.5 }, rpe: 7.5 });
    expect(intake(savedLogs).kcal).toBe(180);
    expect(savedLogs[0].personId).toBe(a);
    expect(await (await trainer.db.open()).getAllFromIndex('dailySnapshots', 'by-person', a)).toEqual([]);
    const repeat = await trainer.exchange.review(text, a, exercises, foods);
    expect(repeat.records.every(item => item.status === 'already-present')).toBe(true);
    await trainer.exchange.apply(repeat, {});
    expect(await (await trainer.db.open()).getAll('trainingSessions')).toHaveLength(1);
    expect(await (await trainer.db.open()).getAll('foodLogs')).toHaveLength(1);
    await trainer.people.selectPerson(b);
    await expect(trainer.exchange.review(text, b, exercises, foods)).rejects.toMatchObject({ code: 'conflict' });
    expect(await (await trainer.db.open()).getAllFromIndex('foodLogs', 'by-person', b)).toEqual([]);
  });

  it('reviews corrected versions, keeps/replaces independently, and rejects stale review or a partial transaction', async () => {
    const client = await device('client');
    const session = actual(client.owner), log = meal(client.owner);
    await (await client.db.open()).put('trainingSessions', session);
    await (await client.db.open()).put('foodLogs', log);
    const first = await client.exchange.export(client.owner, localDate('2026-01-01'), localDate('2026-01-01'), exercises, foods);
    const trainer = await device('trainer');
    await trainer.exchange.apply(await trainer.exchange.review(first, trainer.owner, exercises, foods), {});
    await (await client.db.open()).put('trainingSessions', { ...session, version: 2, updatedAt: '2026-01-02T12:00:00Z', notes: 'Corrección de carga',
      exercises: session.exercises.map((item, index) => ({ ...item, sets: item.sets.map(set => index === 0 && set.status === 'completed'
        ? { ...set, actual: { type: 'weight-reps' as const, weightKg: 15, reps: 9, rir: 1.5 } } : set) })) });
    await (await client.db.open()).put('foodLogs', { ...log, grams: 150, updatedAt: '2026-01-02T12:00:00Z' });
    const second = await client.exchange.export(client.owner, localDate('2026-01-01'), localDate('2026-01-01'), exercises, foods);
    const review = await trainer.exchange.review(second, trainer.owner, exercises, foods);
    expect(review.records.map(item => item.status)).toEqual(['conflicting', 'conflicting']);
    expect(review.records[0].differences.some(item => item.path.includes('weightKg'))).toBe(true);
    await expect(trainer.exchange.apply(review, {})).rejects.toMatchObject({ code: 'invalid' });
    const choices = { [review.records[0].key]: 'keep' as const, [review.records[1].key]: 'replace' as const };
    await trainer.exchange.apply(review, choices);
    expect((await (await trainer.db.open()).getAll('trainingSessions'))[0].version).toBe(1);
    expect((await (await trainer.db.open()).getAll('foodLogs'))[0].grams).toBe(150);
    await trainer.exchange.apply(await trainer.exchange.review(second, trainer.owner, exercises, foods), { [review.records[0].key]: 'replace' });
    expect((await (await trainer.db.open()).getAll('trainingSessions'))[0].version).toBe(2);
    expect((await trainer.exchange.review(second, trainer.owner, exercises, foods)).records.every(item => item.status === 'already-present')).toBe(true);
    await expect(trainer.exchange.apply(review, choices)).rejects.toMatchObject({ code: 'conflict' });
    const third = JSON.parse(second);
    third.payload.sessions[0].version = 3; third.payload.sessions[0].updatedAt = '2026-01-03T12:00:00Z';
    third.payload.foodLogs[0].grams = 160; third.payload.foodLogs[0].updatedAt = '2026-01-03T12:00:00Z';
    const pending = await trainer.exchange.review(JSON.stringify(third), trainer.owner, exercises, foods);
    const original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'foodLogs') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(trainer.exchange.apply(pending, { [pending.records[0].key]: 'replace', [pending.records[1].key]: 'replace' })).rejects.toMatchObject({ code: 'quota' });
    spy.mockRestore();
    expect((await (await trainer.db.open()).getAll('trainingSessions'))[0].version).toBe(2);
    expect((await (await trainer.db.open()).getAll('foodLogs'))[0].grams).toBe(150);
  });

  it('rejects malformed/future/foreign/out-of-range/oversize payloads before any write', async () => {
    const source = await device('client');
    await (await source.db.open()).put('foodLogs', meal(source.owner));
    const text = await source.exchange.export(source.owner, localDate('2026-01-01'), localDate('2026-01-01'), exercises, foods);
    const dest = await device('trainer');
    const month = JSON.parse(text);
    month.through = '2026-01-31';
    expect(parseProgressFile(JSON.stringify(month)).through).toBe('2026-01-31');
    month.through = '2026-02-01';
    await expect(dest.exchange.review(JSON.stringify(month), dest.owner, exercises, foods)).rejects.toThrow('Intervalo de progreso inválido');
    type MutableFile = { schemaVersion: number; kind: string; exportedAt: string; payload: { foodLogs: FoodLog[] } };
    const invalid = [text.slice(0, -1), ' '.repeat(MAX_PLAN_BYTES + 1), ...[
      (data: MutableFile) => { data.schemaVersion = 2; },
      (data: MutableFile) => { data.kind = 'backup'; },
      (data: MutableFile) => { data.exportedAt = '2099-01-01T00:00:00Z'; },
      (data: MutableFile) => { Object.assign(data.payload.foodLogs[0], { personId: newId() }); },
      (data: MutableFile) => { data.payload.foodLogs[0].grams = -1; },
      (data: MutableFile) => { data.payload.foodLogs[0].date = localDate('2025-12-31'); },
      (data: MutableFile) => { data.payload.foodLogs[0].mealLabel = '<img>'; },
      (data: MutableFile) => { Object.assign(data.payload.foodLogs[0].food, { url: 'https://example.org' }); },
    ].map(edit => { const data = JSON.parse(text) as MutableFile; edit(data); return JSON.stringify(data); })];
    for (const bad of invalid) await expect(dest.exchange.review(bad, dest.owner, exercises, foods)).rejects.toThrow();
    expect(await (await dest.db.open()).getAll('externalSubjects')).toEqual([]);
    expect(await (await dest.db.open()).getAll('foodLogs')).toEqual([]);
  });

  it('does not mistake a locally corrected record or altered same-revision foreign payload for an unchanged repeat', async () => {
    const client = await device('client');
    const log = meal(client.owner);
    await (await client.db.open()).put('foodLogs', log);
    const text = await client.exchange.export(client.owner, localDate('2026-01-01'), localDate('2026-01-01'), exercises, foods);
    const trainer = await device('trainer');
    await trainer.exchange.apply(await trainer.exchange.review(text, trainer.owner, exercises, foods), {});
    const db = await trainer.db.open();
    const imported = (await db.getAll('foodLogs'))[0];
    await db.put('foodLogs', { ...imported, grams: 175, updatedAt: '2026-01-02T12:00:00Z' });
    const localConflict = await trainer.exchange.review(text, trainer.owner, exercises, foods);
    expect(localConflict.records[0].status).toBe('conflicting');
    await trainer.exchange.apply(localConflict, { [localConflict.records[0].key]: 'keep' });
    expect((await db.getAll('foodLogs'))[0].grams).toBe(175);
    const tampered = JSON.parse(text);
    tampered.payload.foodLogs[0].grams = 230;
    const foreignConflict = await trainer.exchange.review(JSON.stringify(tampered), trainer.owner, exercises, foods);
    expect(foreignConflict.records[0].status).toBe('conflicting');
    await trainer.exchange.apply(foreignConflict, { [foreignConflict.records[0].key]: 'replace' });
    expect((await db.getAll('foodLogs'))[0]).toMatchObject({ id: imported.id, grams: 230 });
  });
});
