import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { newId } from '../../core/domain/identity';
import { PeopleRepository } from '../people/people.repository';
import { emptyProfile } from '../people/person.model';
import { RoutinesRepository } from '../routines/routines.repository';
import { routineDraft } from '../routines/routine.fixtures';
import { exerciseFixture } from '../exercises/exercise.fixtures';
import { exerciseSnapshot, catalogChoice, customChoice } from '../exercises/exercise-catalog.model';
import { MealPlansRepository } from '../nutrition/meal-plans/meal-plans.repository';
import { mealDraft } from '../nutrition/meal-plans/meal.fixtures';
import { PlanExchange, changes } from './plan-exchange';
import { MAX_PLAN_BYTES, parsePlanFile } from './transfer-schema';

const exercises = [exerciseFixture()];
const foods: never[] = [];
const databases: Database[] = [];
async function device(mode: 'trainer' | 'client') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `exchange-${newId()}` }] });
  const db = TestBed.inject(Database); databases.push(db);
  const people = TestBed.inject(PeopleRepository);
  const routines = TestBed.inject(RoutinesRepository);
  const meals = TestBed.inject(MealPlansRepository);
  const exchange = TestBed.inject(PlanExchange);
  const owner = (await people.load()).settings.personalPersonId;
  await people.chooseMode(mode);
  return { db, people, routines, meals, exchange, owner };
}
afterEach(async () => { vi.restoreAllMocks(); for (const db of databases.splice(0)) { db.close(); await deleteDB(db.name); } });

describe('strict plan file boundary', () => {
  it('rejects malformed, future, unknown, oversized, HTML, remote media, deep and invalid references before storage', () => {
    expect(() => parsePlanFile('{')).toThrow();
    expect(() => parsePlanFile(' '.repeat(MAX_PLAN_BYTES + 1))).toThrow('512');
    const file = { app: 'entrena-con-jesus', schemaVersion: 1, kind: 'plan', exportId: newId(), exportedAt: new Date().toISOString(),
      sourcePerson: { workspaceId: newId(), personId: newId(), displayName: 'Alex' },
      payload: { plans: [{ type: 'routine', planId: newId(), revisionId: newId(), parentRevisionId: null, name: 'Base', archived: false,
        content: { notes: '', weeks: [{ id: newId(), name: 'Week', days: [{ id: newId(), name: 'Day', exercises: [{ id: newId(), notes: '',
          exercise: { exerciseId: newId(), name: 'Custom', category: 'strength', loggingType: 'weight_reps', instruction: '', media: null, catalogVersion: null },
          sets: [{ id: newId(), type: 'weight-reps', restSeconds: 0, notes: '', reps: { minimum: 2, maximum: 4 }, weightKg: 10, targetRir: 2 }] }] }] }] } }], customExercises: [], customFoods: [] } };
    expect(() => parsePlanFile(JSON.stringify(file))).toThrow('referenciado');
    for (const mutation of [
      (value: typeof file) => { value.schemaVersion = 2; },
      (value: typeof file) => { Object.assign(value, { secret: 'other person' }); },
      (value: typeof file) => { value.payload.plans[0].name = '<svg onload=alert(1)>'; },
      (value: typeof file) => { Object.assign(value.payload.plans[0].content.weeks[0].days[0].exercises[0].exercise, { path: 'https://example.org/pic.svg' }); },
      (value: typeof file) => { value.payload.plans[0].content.weeks[0].days[0].exercises[0].sets[0].weightKg = Infinity; },
      (value: typeof file) => { value.exportedAt = '2026-99-99'; },
      (value: typeof file) => { value.sourcePerson.personId = value.sourcePerson.personId.toUpperCase() as typeof value.sourcePerson.personId; },
    ]) {
      const copy = structuredClone(file); mutation(copy); expect(() => parsePlanFile(JSON.stringify(copy))).toThrow();
    }
    const deep = JSON.parse(JSON.stringify(file)); deep.payload.extra = Array.from({ length: 20 }, () => ({}));
    expect(() => parsePlanFile(JSON.stringify(deep))).toThrow();
  });
  it('reports additions, removals, changed values and reordered rows', () => {
    expect(changes({ name: 'Old', rows: [1, 2], removed: true }, { name: 'New', rows: [2, 1], added: true }).map(item => item.path))
      .toEqual(['Plan.name', 'Plan.rows[1]', 'Plan.rows[2]', 'Plan.removed', 'Plan.added']);
  });
});

describe('two isolated plan databases', () => {
  it('round-trips trainer → client → edited return, with explicit keep/accept/copy, stable linkage and no actual records', async () => {
    const trainer = await device('trainer');
    const a = newId(), b = newId();
    for (const id of [a, b]) await trainer.people.savePerson(id, { displayName: 'Alex', reference: id.slice(0, 6), profile: emptyProfile() }, null);
    await trainer.people.selectPerson(a);
    const draft = routineDraft(a); draft.payload.content.weeks[0].days[0].exercises = [
      { id: newId(), exercise: exerciseSnapshot(catalogChoice(exercises[0])), notes: '', sets: draft.payload.content.weeks[0].days[0].exercises[0].sets }];
    await trainer.routines.saveDraft(a, draft, null); const original = await trainer.routines.save(a, draft);
    const exported = await trainer.exchange.export(a, 'routine', original.planId, exercises, foods);
    expect(exported).not.toContain('exercises/test-bench-press-3.svg');
    expect(exported).not.toContain(trainer.owner);
    const client = await device('client');
    const first = await client.exchange.review(exported, client.owner, exercises, foods);
    expect(first.local).toBeNull(); await expect((await client.db.open()).getAll('externalSubjects')).resolves.toEqual([]);
    await client.exchange.apply(first, 'accept');
    const imported = (await client.routines.list(client.owner))[0];
    expect(imported.exchange?.revisionId).toBe(original.id);
    expect(imported.content.weeks[0].days[0].exercises[0].exercise.media).toEqual(original.content.weeks[0].days[0].exercises[0].exercise.media);
    const repeat = await client.exchange.review(exported, client.owner, exercises, foods);
    expect(repeat.repeated).toBe(true); await client.exchange.apply(repeat, 'accept');
    expect(await client.routines.history(client.owner)).toHaveLength(1);
    const edit = routineDraft(client.owner, imported.planId, imported.id); edit.payload.content = structuredClone(imported.content); edit.payload.name = 'Client edit';
    await client.routines.saveDraft(client.owner, edit, null); const modified = await client.routines.save(client.owner, edit);
    const returned = await client.exchange.export(client.owner, 'routine', imported.planId, exercises, foods);
    expect(parsePlanFile(returned).payload.plans[0].parentRevisionId).toBe(original.id);
    expect(parsePlanFile(returned).payload.plans[0].revisionId).toBe(modified.id);
    const review = await trainer.exchange.review(returned, a, exercises, foods);
    expect(review.local?.id).toBe(original.id); expect(review.divergent).toBe(false);
    expect(review.differences.some(item => item.path === 'Plan.name')).toBe(true);
    await trainer.exchange.apply(review, 'keep');
    expect((await trainer.routines.list(a))[0].id).toBe(original.id);
    await trainer.exchange.apply(await trainer.exchange.review(returned, a, exercises, foods), 'copy');
    expect(await trainer.routines.list(a)).toHaveLength(2);
    const accept = await trainer.exchange.review(returned, a, exercises, foods);
    await trainer.exchange.apply(accept, 'accept');
    expect((await trainer.routines.latest(a, original.planId))?.name).toBe('Client edit');
    expect((await trainer.routines.history(a))).toHaveLength(3);
    await trainer.exchange.apply(await trainer.exchange.review(returned, a, exercises, foods), 'copy');
    expect((await trainer.routines.list(a))).toHaveLength(2);
    expect((await trainer.routines.history(b))).toHaveLength(0);
    expect(await (await trainer.db.open()).getAll('trainingSessions')).toEqual([]);
    expect(await (await trainer.db.open()).getAll('foodLogs')).toEqual([]);
    await trainer.people.selectPerson(b);
    await expect(trainer.exchange.review(returned, b, exercises, foods)).rejects.toMatchObject({ code: 'conflict' });
    await trainer.people.selectPerson(a);
    const head = (await trainer.routines.latest(a, original.planId))!;
    const trainerEdit = routineDraft(a, original.planId, head.id); trainerEdit.payload.content = structuredClone(head.content); trainerEdit.payload.name = 'Trainer branch';
    await trainer.routines.saveDraft(a, trainerEdit, null); const trainerBranch = await trainer.routines.save(a, trainerEdit);
    const clientEdit = routineDraft(client.owner, imported.planId, modified.id); clientEdit.payload.content = structuredClone(modified.content); clientEdit.payload.name = 'Client branch';
    await client.routines.saveDraft(client.owner, clientEdit, null); await client.routines.save(client.owner, clientEdit);
    const divergent = await trainer.exchange.review(await client.exchange.export(client.owner, 'routine', imported.planId, exercises, foods), a, exercises, foods);
    expect(divergent.divergent).toBe(true);
    expect((await trainer.routines.latest(a, original.planId))?.id).toBe(trainerBranch.id);
    await trainer.exchange.apply(divergent, 'keep');
    expect((await trainer.routines.latest(a, original.planId))?.name).toBe('Trainer branch');
    const newVersion = await client.exchange.export(client.owner, 'routine', imported.planId, exercises, foods);
    expect(parsePlanFile(newVersion).payload.plans[0].planId).toBe(original.planId);
  });

  it('keeps custom foods usable, detects stale mapping/head and rolls back writes on quota failure', async () => {
    const trainer = await device('trainer');
    const draft = mealDraft(trainer.owner);
    const source = draft.payload.content.weeks[0].days[0].meals[0].foods[0].food.source;
    if (!('customFoodId' in source)) throw new Error('Expected custom fixture');
    const custom = { id: source.customFoodId, personId: trainer.owner,
      name: 'Arroz propio', per100g: { kcal: 130, protein: 2.5, carbohydrate: 28, fat: .3 },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await (await trainer.db.open()).put('customFoods', custom);
    await trainer.meals.saveDraft(trainer.owner, draft, null); const saved = await trainer.meals.save(trainer.owner, draft);
    const text = await trainer.exchange.export(trainer.owner, 'meal-plan', saved.planId, exercises, foods);
    const client = await device('client');
    const mismatched = JSON.parse(text);
    mismatched.payload.plans[0].content.weeks[0].days[0].meals[0].foods[0].food.source.customFoodId = newId();
    await expect(client.exchange.review(JSON.stringify(mismatched), client.owner, exercises, foods)).rejects.toThrow('referenciado');
    const pending = await client.exchange.review(text, client.owner, exercises, foods);
    const stale = await client.exchange.review(text, client.owner, exercises, foods);
    const original = IDBObjectStore.prototype.add;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'mealPlanRevisions') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(client.exchange.apply(pending, 'accept')).rejects.toMatchObject({ code: 'quota' });
    spy.mockRestore();
    expect(await (await client.db.open()).getAll('externalSubjects')).toEqual([]);
    expect(await (await client.db.open()).getAll('customFoods')).toEqual([]);
    await client.exchange.apply(pending, 'accept');
    await expect(client.exchange.apply(stale, 'accept')).rejects.toMatchObject({ code: 'conflict' });
    const imported = (await client.meals.list(client.owner))[0];
    expect(imported.content.weeks[0].days[0].meals[0].foods[0].food.per100g.kcal).toBe(130);
    expect(await (await client.db.open()).get('customFoods', [client.owner, custom.id])).toMatchObject({ name: 'Arroz propio' });
    await expect(client.exchange.apply(pending, 'accept')).rejects.toMatchObject({ code: 'conflict' });
    const edit = mealDraft(client.owner, imported.planId, imported.id); edit.payload.content = structuredClone(imported.content); edit.payload.name = 'Comidas revisadas';
    await client.meals.saveDraft(client.owner, edit, null); await client.meals.save(client.owner, edit);
    const returned = await client.exchange.export(client.owner, 'meal-plan', imported.planId, exercises, foods);
    await trainer.exchange.apply(await trainer.exchange.review(returned, trainer.owner, exercises, foods), 'accept');
    expect((await trainer.meals.latest(trainer.owner, saved.planId))?.name).toBe('Comidas revisadas');
    expect((await client.db.open()).objectStoreNames).toHaveLength(13);
  });
  it('transfers a personal exercise without a network lookup, and rejects broken files without writes', async () => {
    const trainer = await device('trainer');
    const now = new Date().toISOString();
    const resource = { id: newId(), personId: trainer.owner, createdAt: now, updatedAt: now,
      name: 'Movimiento personal', category: 'strength' as const, loggingType: 'weight_reps' as const, instruction: 'Instrucciones propias.' };
    await (await trainer.db.open()).put('customExercises', resource);
    const draft = routineDraft(trainer.owner);
    draft.payload.content.weeks[0].days[0].exercises = [{ id: newId(), exercise: exerciseSnapshot(customChoice(resource)), notes: '',
      sets: draft.payload.content.weeks[0].days[0].exercises[0].sets }];
    await trainer.routines.saveDraft(trainer.owner, draft, null); const saved = await trainer.routines.save(trainer.owner, draft);
    const text = await trainer.exchange.export(trainer.owner, 'routine', saved.planId, exercises, foods);
    expect(text).toContain('Instrucciones propias.');
    const client = await device('client');
    const db = await client.db.open();
    const noNetwork = vi.spyOn(globalThis, 'fetch');
    const extra = JSON.parse(text);
    extra.payload.customExercises.push({ ...extra.payload.customExercises[0], id: newId() });
    await expect(client.exchange.review(JSON.stringify(extra), client.owner, exercises, foods)).rejects.toThrow('ajenos');
    for (const bad of [text.slice(0, -2), text.replace('"schemaVersion": 1', '"schemaVersion": 7'),
      text.replace('"name": "Movimiento personal"', '"name": "<script>"'), ' '.repeat(MAX_PLAN_BYTES + 1)]) {
      await expect(client.exchange.review(bad, client.owner, exercises, foods)).rejects.toThrow();
    }
    expect(await db.getAll('externalSubjects')).toEqual([]);
    expect(await db.getAll('routineRevisions')).toEqual([]);
    expect(await db.getAll('customExercises')).toEqual([]);
    await client.exchange.apply(await client.exchange.review(text, client.owner, exercises, foods), 'accept');
    expect(noNetwork).not.toHaveBeenCalled();
    expect((await client.routines.list(client.owner))[0].content.weeks[0].days[0].exercises[0].exercise.instruction).toBe('Instrucciones propias.');
    expect(await db.get('customExercises', [client.owner, resource.id])).toMatchObject({ name: 'Movimiento personal' });
  });
});
