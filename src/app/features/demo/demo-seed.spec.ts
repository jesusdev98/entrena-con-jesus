import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import exercisesJson from '../../../../public/catalogs/exercises.es.json';
import foodsJson from '../../../../public/catalogs/foods.es.json';
import metsJson from '../../../../public/catalogs/activity-mets.json';
import { newId, localDate } from '../../core/domain/identity';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { PERSONAL_STORES } from '../../core/storage/database-schema';
import { PeopleRepository } from '../people/people.repository';
import { emptyProfile } from '../people/person.model';
import { BackupExchange } from '../transfers/backup-exchange';
import { parseBackup } from '../transfers/backup-schema';
import { parseExerciseCatalog } from '../exercises/exercise-catalog.model';
import { parseFoodCatalog } from '../nutrition/foods/food.model';
import { parseMetCatalog } from '../activity/met-catalog';
import { sessionErrors } from '../training/training-domain';
import { TrainingRepository } from '../training/training.repository';
import { RoutinesRepository } from '../routines/routines.repository';
import { MealPlansRepository } from '../nutrition/meal-plans/meal-plans.repository';
import { calculateActivity } from '../activity/daily-target.model';
import { intake, mondayOf } from '../nutrition/diary/diary.model';
import { buildDemoData } from './demo-data';
import { DemoCleanup } from './demo-cleanup';

const catalogs = { exercises: parseExerciseCatalog(exercisesJson), foods: parseFoodCatalog(foodsJson), mets: parseMetCatalog(metsJson) };
const databases: Database[] = [];
const source = [exercisesJson, foodsJson, metsJson];
function catalogsAvailable() {
  vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
    const index = ['exercises.es.json', 'foods.es.json', 'activity-mets.json'].findIndex(name => String(url).endsWith(name));
    if (index < 0) throw new Error('Unexpected catalog');
    return { ok: true, json: async () => source[index] };
  }));
}
function device() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `demo-${newId()}` }] });
  const db = TestBed.inject(Database), people = TestBed.inject(PeopleRepository), backup = TestBed.inject(BackupExchange);
  databases.push(db);
  return { db, people, backup };
}
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  for (const db of databases.splice(0)) { db.close(); await deleteDB(db.name); }
});
const form = (name = 'Propietario') => ({ displayName: name, reference: '', profile: emptyProfile() });
const onboard = async (d: ReturnType<typeof device>, mode: 'trainer' | 'client', name = 'Propietario') => {
  const s = (await d.people.load()).settings, person = (await d.db.open()).get('people', s.personalPersonId);
  await d.people.savePerson(s.personalPersonId, form(name), (await person)!.updatedAt, undefined, mode);
  return (await d.people.load()).settings;
};

describe('one-time published demo seed', () => {
  it('does not warn that pristine completed sessions were edited', async () => {
    catalogsAvailable(); const d = device(); await onboard(d, 'client');
    const review = await TestBed.inject(DemoCleanup).review();
    expect(review.edited).toBe(false);
    expect(review.drafts).toBe(false);
    expect(review.linked).toBe(false);
  });

  it('warns after a saved correction to a seeded session', async () => {
    catalogsAvailable(); const d = device(), s = await onboard(d, 'client'), db = await d.db.open();
    const session = (await db.getAll('trainingSessions'))[0];
    const repository = TestBed.inject(TrainingRepository);
    const draft = await repository.reopen(s.activePersonId, session.id);
    const corrected = structuredClone(draft);
    corrected.payload.session.notes = 'Corrected actuals';
    await repository.saveDraft(s.activePersonId, corrected, draft);
    await repository.save(s.activePersonId, corrected);
    expect((await TestBed.inject(DemoCleanup).review()).edited).toBe(true);
    expect((await db.get('trainingSessions', [s.activePersonId, session.id]))?.version).toBe(2);
  });

  it('warns after editing a seeded meal plan', async () => {
    catalogsAvailable(); const d = device(), s = await onboard(d, 'client'), db = await d.db.open();
    const plan = (await db.getAll('mealPlanRevisions'))[0];
    await TestBed.inject(MealPlansRepository).setArchived(s.activePersonId, plan, true);
    expect((await TestBed.inject(DemoCleanup).review()).edited).toBe(true);
  });

  it('clears only receipt-owned trainer data after plan deletion and stays consumed across reload and backup restore', async () => {
    catalogsAvailable(); const d = device(), s = await onboard(d, 'trainer'), db = await d.db.open();
    const cleanup = TestBed.inject(DemoCleanup), backup = await d.backup.export();
    expect(s.demoSeed?.receipt?.sessions).toHaveLength(21);
    const plan = (await db.getAll('routineRevisions'))[0];
    await TestBed.inject(RoutinesRepository).deletePermanently(s.activePersonId, plan);
    await cleanup.clear(await cleanup.review());
    for (const store of ['trainingSessions', 'foodLogs', 'dailySnapshots', 'routineRevisions', 'mealPlanRevisions'] as const)
      expect(await db.count(store)).toBe(0);
    expect(await db.count('people')).toBe(1);
    expect((await d.people.load()).settings).toMatchObject({ activePersonId: s.personalPersonId,
      demoSeed: { status: 'cleared' } });
    await expect(cleanup.review()).rejects.toMatchObject({ code: 'invalid' });
    d.db.close(); await d.people.load();
    expect((await d.people.load()).settings.demoSeed?.status).toBe('cleared');
    const dest = device(); await dest.people.load(); await dest.backup.restore(await dest.backup.review(backup));
    const restored = (await dest.people.load()).settings;
    expect(restored.demoSeed?.receipt).toEqual(s.demoSeed?.receipt);
    await TestBed.inject(DemoCleanup).clear(await TestBed.inject(DemoCleanup).review());
    expect((await dest.people.load()).settings.demoSeed?.status).toBe('cleared');
    expect((await parseBackup(await dest.backup.export())).payload.trainingSessions).toHaveLength(0);
  });

  it('keeps the client personal profile and unrelated new food after clearing demo records', async () => {
    catalogsAvailable(); const d = device(), settings = await onboard(d, 'client', 'Ana'), db = await d.db.open();
    const log = (await db.getAll('foodLogs'))[0], now = new Date().toISOString();
    const real = { ...log, id: newId(), createdAt: now, updatedAt: now, grams: 233, mealLabel: 'Almuerzo real' };
    await db.add('foodLogs', real);
    await TestBed.inject(DemoCleanup).clear(await TestBed.inject(DemoCleanup).review());
    expect(await db.getAll('foodLogs')).toEqual([real]);
    expect(await db.count('trainingSessions')).toBe(0);
    expect(await db.count('dailySnapshots')).toBe(0);
    expect((await db.get('people', settings.personalPersonId))?.displayName).toBe('Ana');
    expect((await db.get('settings', 'workspace'))?.demoSeed?.status).toBe('cleared');
    await d.backup.export();
  });

  it('blocks stale cleanup reviews and rolls back partial deletion on quota', async () => {
    catalogsAvailable(); const d = device(), s = await onboard(d, 'trainer'), db = await d.db.open();
    const cleanup = TestBed.inject(DemoCleanup), stale = await cleanup.review(), plan = (await db.getAll('routineRevisions'))[0];
    await TestBed.inject(RoutinesRepository).setArchived(s.activePersonId, plan, true);
    await expect(cleanup.clear(stale)).rejects.toMatchObject({ code: 'conflict' });
    const review = await cleanup.review(); expect(review.edited).toBe(true);
    const original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'settings') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(cleanup.clear(review)).rejects.toMatchObject({ code: 'quota' });
    spy.mockRestore();
    expect(await db.count('trainingSessions')).toBe(21);
    expect(await db.count('routineRevisions')).toBe(2);
    expect((await db.get('settings', 'workspace'))?.demoSeed?.status).toBe('seeded');
    await cleanup.clear(await cleanup.review());
    expect(await db.count('trainingSessions')).toBe(0);
  });

  it('never clears a marker-only legacy seed or records of a same-name real client', async () => {
    catalogsAvailable(); const d = device(), s = await onboard(d, 'trainer'), db = await d.db.open();
    const realId = newId(); await d.people.savePerson(realId, form('Usuario de prueba'), null);
    const food = { ...(await db.getAll('foodLogs'))[0], id: newId(), personId: realId };
    await db.add('foodLogs', food);
    await TestBed.inject(DemoCleanup).clear(await TestBed.inject(DemoCleanup).review());
    expect(await db.get('people', realId)).toMatchObject({ displayName: 'Usuario de prueba' });
    expect(await db.get('foodLogs', [realId, food.id])).toEqual(food);
    const legacy = { ...(await db.get('settings', 'workspace'))!, demoSeed: { version: 1 as const, status: 'seeded' as const } };
    await db.put('settings', legacy);
    await expect(TestBed.inject(DemoCleanup).review()).rejects.toMatchObject({ code: 'invalid' });
    expect((await d.people.load()).settings.personalPersonId).toBe(s.personalPersonId);
  });

  it('retains the trainer demo person when they have newly created records', async () => {
    catalogsAvailable(); const d = device(), s = await onboard(d, 'trainer'), db = await d.db.open();
    const now = new Date().toISOString();
    const real = { id: newId(), personId: s.activePersonId, createdAt: now, updatedAt: now, name: 'Personal',
      per100g: { kcal: 133, protein: 5, carbohydrate: 11, fat: 6 } };
    await db.add('customFoods', real);
    await TestBed.inject(DemoCleanup).clear(await TestBed.inject(DemoCleanup).review());
    expect(await db.get('customFoods', [s.activePersonId, real.id])).toEqual(real);
    expect(await db.get('people', s.activePersonId)).toMatchObject({ displayName: 'Usuario de prueba' });
    expect((await db.get('settings', 'workspace'))?.activePersonId).toBe(s.activePersonId);
    expect(await db.count('trainingSessions')).toBe(0);
    await d.backup.export();
  });

  it('refuses to remove edited seed drafts or actuals linked by later real days', async () => {
    catalogsAvailable(); const d = device(), s = await onboard(d, 'trainer'), db = await d.db.open();
    const day = (await db.getAll('dailySnapshots'))[0], now = new Date().toISOString();
    if (!('schemaVersion' in day)) throw new Error('Expected seeded version 2');
    const draft = { id: newId(), personId: s.activePersonId, createdAt: now, updatedAt: now,
      editorKey: `activity:${day.date}`, payload: { kind: 'daily-target' as const, date: day.date, context: day.context,
        value: { ...day.activity, totalSteps: { actual: 1234 } }, base: day } };
    await db.add('drafts', draft);
    const cleanup = TestBed.inject(DemoCleanup);
    expect((await cleanup.review()).drafts).toBe(true);
    await expect(cleanup.clear(await cleanup.review())).rejects.toMatchObject({ code: 'conflict' });
    await db.delete('drafts', [s.activePersonId, draft.id]);
    const session = (await db.getAll('trainingSessions')).find(item => item.date === day.date)!;
    const newer = { ...day, id: newId(), date: localDate('2026-01-05'), createdAt: now, updatedAt: now,
      activity: { ...day.activity, training: { actual: { includedSteps: 0, blocks: [{ id: newId(), minutes: 55,
        linkedTrainingSessionId: session.id, expenditure: day.activity.training.actual!.blocks[0].expenditure }] } } } };
    await db.add('dailySnapshots', newer);
    const review = await cleanup.review();
    expect(review.linked).toBe(true);
    await expect(cleanup.clear(review)).rejects.toMatchObject({ code: 'conflict' });
    expect(await db.get('trainingSessions', [s.activePersonId, session.id])).toEqual(session);
  });
  it('builds 4 real-source days, 6 elapsed 3/4 weeks, actual diary and valid version-2 snapshots', () => {
    const person = { id: newId(), kind: 'client' as const, displayName: 'Demo', reference: '', archived: false,
      profile: { ...emptyProfile(), age: 32, formulaSex: 'male' as const, heightCm: 176, weightKg: 78 },
      createdAt: '2026-09-25T12:00:00Z', updatedAt: '2026-09-25T12:00:00Z' };
    const demo = buildDemoData(person, catalogs, localDate('2026-09-25'));
    expect(demo.routine.content.weeks[0].days).toHaveLength(4);
    expect(demo.sessions).toHaveLength(21);
    const monday = mondayOf(localDate('2026-09-25'));
    expect(demo.sessions.every(s => s.date < monday && s.status === 'completed' && !sessionErrors(s).length)).toBe(true);
    const weeks = [...new Set(demo.sessions.map(s => mondayOf(s.date)))];
    expect(weeks.map(week => demo.sessions.filter(s => mondayOf(s.date) === week).length)).toEqual([3, 4, 3, 4, 3, 4]);
    expect(demo.sessions.flatMap(s => s.exercises).flatMap(e => e.sets).every(s => s.status === 'completed' && s.rpe >= 7.5)).toBe(true);
    expect([...new Set(demo.sessions.filter(s => s.labels.day.includes('Superior')).flatMap(s => s.exercises)
      .filter(e => e.exercise.exerciseId === 'exercise-bench-press').flatMap(e => e.sets)
      .map(s => s.status === 'completed' && s.actual.type === 'weight-reps' ? s.actual.weightKg : -1))]).toEqual([50, 52.5, 55]);
    expect(demo.mealPlan.content.weeks[0].days).toHaveLength(7);
    expect(demo.mealPlan.content.weeks[0].days.every(day => day.meals.map(meal => meal.name).join() === 'Desayuno,Comida,Merienda,Cena')).toBe(true);
    expect(demo.foodLogs).toHaveLength(96);
    expect(new Set(demo.foodLogs.map(log => log.date)).size).toBe(12);
    expect(demo.foodLogs.every(log => 'fdcId' in log.food.source && log.source === null)).toBe(true);
    const sums = demo.snapshots.map(s => intake(demo.foodLogs.filter(log => log.date === s.date)).kcal / s.calculation.result.targetKcal);
    expect(Math.min(...sums)).toBeLessThan(1);
    expect(Math.max(...sums)).toBeGreaterThan(1);
    expect(demo.snapshots.every(s => s.schemaVersion === 2 && s.version === 1 &&
      s.calculation.result.expenditure.mode === 'estimated' && calculateActivity(s.activity, s.context).result.targetKcal === s.calculation.result.targetKcal)).toBe(true);
  });

  it('seeds a distinct visible active trainer client and retains the personal owner', async () => {
    catalogsAvailable(); const d = device();
    const s = await onboard(d, 'trainer', 'Mi nombre'), db = await d.db.open();
    expect(s.demoSeed).toMatchObject({ version: 1, status: 'seeded', receipt: { personId: s.activePersonId,
      trainerPersonId: s.activePersonId } });
    expect(s.activePersonId).not.toBe(s.personalPersonId);
    expect((await db.get('people', s.personalPersonId))?.displayName).toBe('Mi nombre');
    expect((await db.get('people', s.activePersonId))?.displayName).toBe('Usuario de prueba');
    expect(await db.count('trainingSessions')).toBe(21);
    expect((await parseBackup(await d.backup.export())).payload.dailySnapshots).toHaveLength(12);
    await db.clear('routineRevisions'); await db.clear('mealPlanRevisions'); await db.clear('trainingSessions');
    expect((await d.people.load()).settings.demoSeed?.status).toBe('seeded');
    expect(await db.count('routineRevisions')).toBe(0);
  });

  it('allows permanent plan deletion while preserving actual demo history and its consumed marker', async () => {
    catalogsAvailable(); const d = device(), s = await onboard(d, 'trainer'), db = await d.db.open();
    const routine = (await db.getAll('routineRevisions'))[0], meal = (await db.getAll('mealPlanRevisions'))[0];
    await TestBed.inject(RoutinesRepository).deletePermanently(s.activePersonId, routine);
    await TestBed.inject(MealPlansRepository).deletePermanently(s.activePersonId, meal);
    expect(await db.count('routineRevisions')).toBe(0);
    expect(await db.count('mealPlanRevisions')).toBe(0);
    expect(await db.count('trainingSessions')).toBe(21);
    expect(await db.count('foodLogs')).toBe(96);
    const exported = await parseBackup(await d.backup.export());
    expect(exported.payload.settings[0].demoSeed?.status).toBe('seeded');
    expect(exported.payload.trainingSessions[0].source?.revisionId).toBe(routine.id);
    expect((await d.people.load()).settings.demoSeed?.status).toBe('seeded');
  });

  it('uses only the client personal workspace and preserves entered anthropometrics and goals', async () => {
    catalogsAvailable(); const d = device(), s = (await d.people.load()).settings;
    const profile = { ...emptyProfile(), age: 48, formulaSex: 'female' as const, heightCm: 166, weightKg: 68,
      goal: 'loss' as const, adjustmentKcal: 200 };
    await d.people.savePerson(s.personalPersonId, { displayName: 'Ana', reference: '', profile },
      (await (await d.db.open()).get('people', s.personalPersonId))!.updatedAt, undefined, 'client');
    const db = await d.db.open(), settings = (await d.people.load()).settings;
    expect(settings.activePersonId).toBe(s.personalPersonId);
    expect(await db.count('people')).toBe(1);
    expect((await db.get('people', s.personalPersonId))?.profile).toEqual(profile);
    expect((await db.getAll('dailySnapshots')).every(day => day.personId === s.personalPersonId)).toBe(true);
    expect((await parseBackup(await d.backup.export())).payload.trainingSessions).toHaveLength(21);
  });

  it('uses manual example targets without inventing missing measurements', async () => {
    catalogsAvailable(); const d = device(), s = await onboard(d, 'client', 'Sin medidas'), db = await d.db.open();
    const profile = (await db.get('people', s.personalPersonId))!.profile;
    expect([profile.age, profile.formulaSex, profile.heightCm, profile.weightKg]).toEqual([null, null, null, null]);
    const days = await db.getAll('dailySnapshots'), logs = await db.getAll('foodLogs');
    expect(days).toHaveLength(12);
    expect(days.every(day => 'schemaVersion' in day && day.activity.mode === 'manual-tdee' &&
      day.activity.manualReason.includes('Demo') && day.calculation.result.expenditure.mode === 'manual-tdee')).toBe(true);
    const ratios = days.filter(day => 'schemaVersion' in day).map(day =>
      intake(logs.filter(log => log.date === day.date)).kcal / day.calculation.result.targetKcal);
    expect(Math.min(...ratios)).toBeLessThan(0.9);
    expect(Math.max(...ratios)).toBeGreaterThan(1.05);
  });

  it('uses the official older-adult MET table for a complete older client profile', async () => {
    catalogsAvailable(); const d = device(), s = (await d.people.load()).settings;
    const person = (await (await d.db.open()).get('people', s.personalPersonId))!;
    await d.people.savePerson(s.personalPersonId, { displayName: 'Pilar', reference: '',
      profile: { ...emptyProfile(), age: 65, formulaSex: 'female', heightCm: 162, weightKg: 66 } }, person.updatedAt, undefined, 'client');
    const snapshots = await (await d.db.open()).getAll('dailySnapshots');
    expect(snapshots).toHaveLength(12);
    expect(snapshots.every(s => 'schemaVersion' in s && s.calculation.result.expenditure.mode === 'estimated' &&
      s.calculation.result.expenditure.blocks.every(block => block.activity?.table === 'older-adult'))).toBe(true);
    await d.backup.export();
  });

  it('keeps a markerless old workspace and a nonempty eligible workspace unseeded', async () => {
    catalogsAvailable(); const old = device(), legacy = (await old.people.load()).settings, oldDb = await old.db.open();
    delete legacy.demoSeed; await oldDb.put('settings', legacy);
    expect((await onboard(old, 'client')).demoSeed?.status).toBe('ineligible');
    expect(await oldDb.count('routineRevisions')).toBe(0);
    const dirty = device(), s = (await dirty.people.load()).settings, db = await dirty.db.open();
    await db.add('customFoods', { id: newId(), personId: s.personalPersonId, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), name: 'Propio', per100g: { kcal: 50, protein: 2, carbohydrate: 5, fat: 2 } });
    expect((await onboard(dirty, 'trainer')).demoSeed?.status).toBe('ineligible');
    expect(await db.count('people')).toBe(1);
    expect(await db.count('customFoods')).toBe(1);
  });

  it('keeps another person and their real records unchanged when legacy onboarding finishes', async () => {
    catalogsAvailable(); const d = device(), s = (await d.people.load()).settings, db = await d.db.open();
    const id = newId(), now = new Date().toISOString();
    const person = { id, kind: 'client' as const, displayName: 'Cliente real', reference: 'A', archived: false,
      profile: emptyProfile(), createdAt: now, updatedAt: now };
    const log = { id: newId(), personId: id, createdAt: now, updatedAt: now, date: localDate('2026-01-05'),
      mealLabel: 'Comida', food: { foodId: 'fdc-321358', name: 'Hummus comercial',
        per100g: { kcal: 229, protein: 7.35, carbohydrate: 14.9, fat: 17.1 },
        source: { fdcId: '321358', version: 'foundation/2026-04-30' } }, grams: 180, source: null };
    await db.add('people', person); await db.add('foodLogs', log);
    const personal = (await db.get('people', s.personalPersonId))!;
    await d.people.savePerson(s.personalPersonId, form(), personal.updatedAt, undefined, 'trainer');
    expect((await d.people.load()).settings.demoSeed?.status).toBe('ineligible');
    expect(await db.get('people', id)).toEqual(person);
    expect(await db.get('foodLogs', [id, log.id])).toEqual(log);
    expect(await db.count('trainingSessions')).toBe(0);
  });

  it('restores eligible backups as ineligible; consumed backups remain consumed', async () => {
    catalogsAvailable(); const a = device(); await a.people.load(); const eligible = await a.backup.export();
    const b = device(); await b.people.load(); await b.backup.restore(await b.backup.review(eligible));
    expect((await b.people.load()).settings.demoSeed?.status).toBe('ineligible');
    await onboard(b, 'client'); expect(await (await b.db.open()).count('foodLogs')).toBe(0);
    await onboard(a, 'trainer'); const seeded = await a.backup.export();
    const c = device(); await c.people.load(); await c.backup.restore(await c.backup.review(seeded));
    expect((await c.people.load()).settings.demoSeed?.status).toBe('seeded');
    expect((await parseBackup(await c.backup.export())).payload.trainingSessions).toHaveLength(21);
  });

  it('retains an unsaved onboarding draft after quota rollback and excludes unrelated drafts from seeding', async () => {
    catalogsAvailable(); const d = device(), settings = (await d.people.load()).settings, db = await d.db.open();
    const owner = settings.personalPersonId, person = (await db.get('people', owner))!, now = new Date().toISOString();
    const draft = { id: newId(), personId: owner, editorKey: `person:${owner}`, createdAt: now, updatedAt: now,
      payload: { kind: 'person' as const, subjectId: owner, value: form('Borrador'), baseUpdatedAt: person.updatedAt } };
    await db.add('drafts', draft);
    const original = IDBObjectStore.prototype.add;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'trainingSessions') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(d.people.savePerson(owner, form('Borrador'), person.updatedAt, draft, 'client')).rejects.toMatchObject({ code: 'quota' });
    spy.mockRestore();
    expect(await db.get('drafts', [owner, draft.id])).toEqual(draft);
    expect((await db.get('settings', 'workspace'))?.demoSeed?.status).toBe('eligible');
    await d.people.savePerson(owner, form('Borrador'), person.updatedAt, draft, 'client');
    expect(await db.get('drafts', [owner, draft.id])).toBeUndefined();
    const other = device(), initial = (await other.people.load()).settings, otherDb = await other.db.open();
    await otherDb.add('drafts', { ...draft, id: newId(), personId: initial.personalPersonId, editorKey: 'food-diary:new',
      payload: { kind: 'food-diary', date: localDate('2026-09-01'), food: null, grams: null, mealLabel: 'Comida' } });
    expect((await onboard(other, 'trainer')).demoSeed?.status).toBe('ineligible');
    expect(await otherDb.count('trainingSessions')).toBe(0);
    expect(await otherDb.count('drafts')).toBe(1);
  });

  it('does not open a write transaction when a published catalog is unavailable', async () => {
    const d = device(), s = (await d.people.load()).settings, db = await d.db.open();
    const owner = s.personalPersonId, person = (await db.get('people', owner))!, now = new Date().toISOString();
    const draft = { id: newId(), personId: owner, editorKey: `person:${owner}`, createdAt: now, updatedAt: now,
      payload: { kind: 'person' as const, subjectId: owner, value: form('Pendiente'), baseUpdatedAt: person.updatedAt } };
    await db.add('drafts', draft);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Offline catalog unavailable'); }));
    const write = vi.spyOn(db, 'transaction');
    await expect(d.people.savePerson(owner, form('Pendiente'), person.updatedAt, draft, 'client')).rejects.toThrow();
    expect(write).not.toHaveBeenCalledWith(expect.anything(), 'readwrite');
    expect((await db.get('settings', 'workspace'))?.demoSeed?.status).toBe('eligible');
    expect(await db.get('drafts', [owner, draft.id])).toEqual(draft);
    catalogsAvailable();
    await d.people.savePerson(owner, form('Pendiente'), person.updatedAt, draft, 'client');
    expect((await db.get('settings', 'workspace'))?.demoSeed?.status).toBe('seeded');
  });

  it('serializes concurrent onboarding and rolls back quota failures without consuming eligibility', async () => {
    catalogsAvailable(); const d = device(), s = (await d.people.load()).settings, db = await d.db.open();
    const base = (await db.get('people', s.personalPersonId))!.updatedAt;
    const original = IDBObjectStore.prototype.add;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'foodLogs') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(d.people.savePerson(s.personalPersonId, form(), base, undefined, 'client')).rejects.toMatchObject({ code: 'quota' });
    spy.mockRestore();
    expect((await d.people.load()).settings.demoSeed?.status).toBe('eligible');
    expect(await db.count('trainingSessions')).toBe(0);
    const results = await Promise.allSettled([d.people.savePerson(s.personalPersonId, form(), base, undefined, 'client'),
      d.people.savePerson(s.personalPersonId, form(), base, undefined, 'client')]);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await db.count('trainingSessions')).toBe(21);
    expect((await d.people.load()).settings.demoSeed?.status).toBe('seeded');
    expect(PERSONAL_STORES).toHaveLength(11);
  });
});
