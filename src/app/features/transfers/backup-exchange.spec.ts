import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { localDate, newId, type UUID } from '../../core/domain/identity';
import { PeopleRepository } from '../people/people.repository';
import { emptyProfile } from '../people/person.model';
import { BackupExchange } from './backup-exchange';
import { BACKUP_STORES, checksum, parseBackup } from './backup-schema';

const databases: Database[] = [];
async function device() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `backup-${newId()}` }] });
  const db = TestBed.inject(Database), people = TestBed.inject(PeopleRepository), backup = TestBed.inject(BackupExchange);
  databases.push(db);
  const settings = (await people.load()).settings;
  await people.chooseMode('trainer');
  return { db, people, backup, owner: settings.personalPersonId };
}
afterEach(async () => { vi.restoreAllMocks(); for (const db of databases.splice(0)) { db.close(); await deleteDB(db.name); } });
const at = '2026-01-01T12:00:00Z', date = localDate('2026-01-01');
function owned(personId: UUID) { return { id: newId(), personId, createdAt: at, updatedAt: at }; }
async function seed(db: Database, owner: UUID, other: UUID) {
  const connection = await db.open();
  const profile = owned(owner), exercise = owned(other), food = { ...owned(other), name: 'Receta', per100g: { kcal: 100, protein: 3, carbohydrate: 20, fat: 1 } }, routine = owned(other), meal = owned(other);
  const log = owned(other), session = owned(other), snapshot = owned(other), receipt = owned(other), mealId = newId(), mealPlanId = newId();
  const exerciseSnapshot = { exerciseId: exercise.id, name: 'Propio', category: 'strength' as const, loggingType: 'weight_reps' as const,
    instruction: 'Empujar', catalogVersion: null, media: null };
  const prescription = { id: newId(), type: 'weight-reps' as const, restSeconds: null, notes: '', reps: { minimum: 8, maximum: 12 }, weightKg: null, targetRir: null };
  await connection.put('profileRevisions', { ...profile, profile: emptyProfile() });
  await connection.put('customExercises', { ...exercise, name: 'Propio', category: 'strength', loggingType: 'weight_reps', instruction: 'Empujar' });
  await connection.put('customFoods', food);
  await connection.put('routineRevisions', { ...routine, planId: newId(), parentRevisionId: null, name: 'Rutina', content: { notes: '', weeks: [
    { id: newId(), name: 'Semana', days: [{ id: newId(), name: 'Día', exercises: [{ id: newId(), exercise: exerciseSnapshot, sets: [prescription], notes: '' }] }] }] } });
  await connection.put('mealPlanRevisions', { ...meal, planId: mealPlanId, parentRevisionId: null, name: 'Comidas', content: { notes: '', weeks: [
    { id: newId(), name: 'Semana', days: [{ id: newId(), name: 'Día', meals: [{ id: mealId, name: 'Comida', foods: [{ id: newId(),
      food: { foodId: food.id, name: food.name, per100g: food.per100g, source: { customFoodId: food.id } }, grams: 120 }] }] }] }] } });
  await connection.put('trainingSessions', { ...session, date, status: 'completed', source: null,
    labels: { routine: 'Rutina', week: 'Semana', day: 'Día', routineNotes: '' }, version: 1, startedAt: at, completedAt: at,
    exercises: [{ id: newId(), exercise: exerciseSnapshot, notes: '', sets: [{ id: newId(), prescribed: prescription, status: 'completed',
      actual: { type: 'weight-reps', weightKg: 10, reps: 9, rir: 1 }, rpe: 8, completedAt: at }] }],
    personExerciseKeys: [`${other}:${exercise.id}`], durationMinutes: null, durationSource: null, notes: '' });
  await connection.put('foodLogs', { ...log, date, mealLabel: 'Almuerzo', food: { foodId: food.id, name: food.name,
    per100g: food.per100g, source: { customFoodId: food.id } }, grams: 120,
    source: { planId: mealPlanId, revisionId: meal.id, mealId, plannedFoodId: newId(), consumptionId: receipt.id } });
  await connection.put('dailySnapshots', { ...snapshot, date, profileRevisionId: profile.id, profile: emptyProfile(),
    activity: { totalSteps: { status: 'actual', value: 0 }, work: { status: 'actual', value: [] }, training: { status: 'actual', value: [] },
      walking: { mode: 'cadence', stepsPerMinute: 100, activity: { code: '17170', met: 3, version: '2024', table: 'adult', referenceOxygenMlKgMin: 3.5 } } },
    calculation: { mode: 'manual', expenditureKcal: 2000, reason: 'Manual' }, expenditureKcal: 2000, signedAdjustmentKcal: 0,
    targetKcal: 2000, macroPercentages: emptyProfile().macros, macroGrams: emptyProfile().macros, provisional: false });
  await connection.put('mealConsumptions', { ...receipt, date, revisionId: meal.id, mealId, state: 'consumed', foodLogIds: [log.id] });
  await connection.put('drafts', { ...owned(other), editorKey: 'routine:new', payload: { kind: 'routine', planId: newId(), baseRevisionId: null,
    name: 'Sin terminar', content: { notes: '', weeks: [] } } });
  await connection.put('externalSubjects', { ...owned(other), externalWorkspaceId: newId(), externalPersonId: newId() });
}
async function bytes(db: Database): Promise<string> {
  const connection = await db.open();
  return JSON.stringify(Object.fromEntries(await Promise.all(BACKUP_STORES.map(async name => [name, await connection.getAll(name)]))));
}
interface MutableFile { payload: { people: { id: string; displayName: string }[]; foodLogs: { personId: string; source: { consumptionId: string } }[];
  mealConsumptions: { foodLogIds: string[] }[]; customFoods: { per100g: { kcal: number } }[];
  dailySnapshots: { date: string; schemaVersion?: number; extra?: string }[]; trainingSessions: { notes: string }[];
  drafts: { payload: { extra?: string } }[]; routineRevisions: { parentRevisionId: string | null; content: { weeks: { days: { exercises: { exercise: { media: unknown } }[] }[] }[] } }[] }; checksum: string }
async function edited(text: string, change: (file: MutableFile) => void): Promise<string> {
  const file = JSON.parse(text); change(file); file.checksum = await checksum(file.payload); return JSON.stringify(file);
}

describe('full personal device backup', () => {
  it('round-trips all 13 stores across two isolated databases, retaining stable same-name identities and drafts', async () => {
    const source = await device(), a = newId(), b = newId();
    await source.people.savePerson(a, { displayName: 'Alex', reference: 'A', profile: emptyProfile() }, null);
    await source.people.savePerson(b, { displayName: 'Alex', reference: 'B', profile: emptyProfile() }, null);
    await source.people.selectPerson(b); await seed(source.db, source.owner, a);
    const original = await bytes(source.db), text = await source.backup.export();
    const dest = await device();
    const before = await bytes(dest.db);
    const review = await dest.backup.review(text);
    expect(review.people.filter(p => p.name === 'Alex').map(p => p.id).sort()).toEqual([a, b].sort());
    expect(await bytes(dest.db)).toBe(before); // review/cancel do not clear anything
    expect(review.counts).toHaveLength(13);
    await dest.backup.restore(review);
    expect(await bytes(dest.db)).toBe(original);
    await dest.backup.restore(await dest.backup.review(text));
    expect(await bytes(dest.db)).toBe(original);
    expect((await dest.people.load()).settings.activePersonId).toBe(b);
  });

  it('rejects corruption, future versions, cross-person and dangling references before writes', async () => {
    const source = await device(), other = newId();
    await source.people.savePerson(other, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null);
    await seed(source.db, source.owner, other);
    const text = await source.backup.export(), dest = await device(), previous = await bytes(dest.db);
    const invalid = [text.slice(0, -1), text.replace(/"schemaVersion":1/, '"schemaVersion":2'),
      text.replace(/"kind":"backup"/, '"kind":"plan"'), ' '.repeat(20 * 1024 * 1024 + 1),
      await edited(text, f => { f.payload.people[1].id = newId(); }),
      await edited(text, f => { f.payload.foodLogs[0].personId = source.owner; }),
      await edited(text, f => { f.payload.foodLogs[0].source.consumptionId = newId(); }),
      await edited(text, f => { f.payload.customFoods[0].per100g.kcal = -2; }),
      await edited(text, f => { f.payload.people[0].displayName = '<svg onload=alert(1)>'; }),
      await edited(text, f => { f.payload.dailySnapshots[0].date = '2026-02-30'; }),
      await edited(text, f => { f.payload.dailySnapshots[0].schemaVersion = 3; }),
      await edited(text, f => { f.payload.dailySnapshots[0].extra = 'not a saved field'; }),
      await edited(text, f => { f.payload.drafts[0].payload.extra = 'unexpected'; }),
      await edited(text, f => { f.payload.routineRevisions[0].parentRevisionId = newId(); }),
      await edited(text, f => { f.payload.routineRevisions[0].content.weeks[0].days[0].exercises[0].exercise.media = { path: 'https://example.org/remote.svg' }; }),
      await edited(text, f => { f.payload.trainingSessions[0].notes = 'https://example.org/remote.svg'; }),
    ];
    for (const bad of invalid) await expect(dest.backup.review(bad)).rejects.toThrow();
    expect(await bytes(dest.db)).toBe(previous);
  });

  it('aborts on quota after deletion and partial inserts; refuses a stale review', async () => {
    const source = await device(), other = newId();
    await source.people.savePerson(other, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null);
    await seed(source.db, source.owner, other);
    const dest = await device(), review = await dest.backup.review(await source.backup.export());
    const previous = await bytes(dest.db), original = IDBObjectStore.prototype.add;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'foodLogs') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(dest.backup.restore(review)).rejects.toMatchObject({ code: 'quota' });
    spy.mockRestore();
    expect(await bytes(dest.db)).toBe(previous);
    await dest.people.savePerson(newId(), { displayName: 'Nuevo', reference: '', profile: emptyProfile() }, null);
    const changed = await bytes(dest.db);
    await expect(dest.backup.restore(review)).rejects.toMatchObject({ code: 'conflict' });
    expect(await bytes(dest.db)).toBe(changed);
    expect((await parseBackup(await source.backup.export())).payload.drafts).toHaveLength(1);
  });
});
