import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId, localDate, type UUID } from '../../../core/domain/identity';
import { Database, DATABASE_NAME } from '../../../core/storage/database';
import { PeopleRepository } from '../../people/people.repository';
import { emptyProfile } from '../../people/person.model';
import { DailyTargetRepository } from '../../activity/daily-target.repository';
import { activityCatalog, activityContext } from '../../activity/activity.fixtures';
import { calculateActivity, initialActivity, type DailyTargetSnapshot } from '../../activity/daily-target.model';
import { mealDraft } from '../meal-plans/meal.fixtures';
import { MealPlansRepository } from '../meal-plans/meal-plans.repository';
import foodsJson from '../../../../../public/catalogs/foods.es.json';
import { catalogChoice, foodSnapshot, parseFoodCatalog } from '../foods/food.model';
import { testFood } from '../meal-plans/meal.fixtures';
import type { FoodSnapshot } from '../nutrition.model';
import { comparison, intake, mondayOf, ringProgress, weekDates } from './diary.model';
import { DiaryRepository, type DiaryDraft } from './diary.repository';

const date = localDate('2026-09-21');
describe('actual food diary', () => {
  let db: Database, repo: DiaryRepository, people: PeopleRepository, plans: MealPlansRepository, owner: UUID;
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `diary-${newId()}` }] });
    db = TestBed.inject(Database); repo = TestBed.inject(DiaryRepository); people = TestBed.inject(PeopleRepository);
    plans = TestBed.inject(MealPlansRepository); owner = (await people.load()).settings.personalPersonId; await people.chooseMode('trainer');
  });
  afterEach(async () => { vi.restoreAllMocks(); db.close(); await deleteDB(db.name); });
  const sourced = parseFoodCatalog(foodsJson);
  const rice = (_id: UUID): FoodSnapshot => foodSnapshot(catalogChoice(sourced.find(entry => entry.source.fdcId === '2512381')!));
  const chicken = (_id: UUID): FoodSnapshot => foodSnapshot(catalogChoice(sourced.find(entry => entry.source.fdcId === '2646170')!));
  it('counts published kcal independently of macros, dates and zero versus absent targets', async () => {
    await repo.add(owner, date, 'Almuerzo', rice(owner), 37.5);
    await repo.add(owner, date, 'Almuerzo', chicken(owner), 175);
    const values = intake(await repo.day(owner, date));
    expect(values.kcal).toBeCloseTo(334.75, 6);
    expect(values.protein).toBeCloseTo(42.015, 2);
    expect(values.carbohydrate).toBeCloseTo(30.1125, 2);
    expect(values.fat).toBeCloseTo(3.76375, 2);
    expect(comparison(await repo.day(owner, date), null).target).toBeNull();
    expect(await repo.day(owner, localDate('2026-09-22'))).toEqual([]);
    expect(ringProgress(10, 0)).toBe(0); expect(ringProgress(200, 100)).toBe(100);
    expect(ringProgress(1, Number.NaN)).toBe(0); expect(Number.isFinite(ringProgress(1, Number.MIN_VALUE))).toBe(true);
    expect(mondayOf(localDate('2027-01-01'))).toBe('2026-12-28');
    expect(weekDates(date)).toHaveLength(7);
  });
  it('transfers once, captures independent actual grams, edits, undoes and never changes plan revisions', async () => {
    const draft = mealDraft(owner); await plans.saveDraft(owner, draft, null); const plan = await plans.save(owner, draft);
    const snapshot = structuredClone(plan); const meal = plan.content.weeks[0].days[0].meals[0];
    expect(await repo.day(owner, date)).toHaveLength(0);
    const receipt = await repo.consume(owner, date, plan, meal, [175]);
    expect(await repo.consume(owner, date, plan, meal, [900])).toEqual(receipt);
    const logs = await repo.day(owner, date); expect(logs).toHaveLength(1); expect(logs[0].grams).toBe(175);
    expect(logs[0].food).toEqual(meal.foods[0].food); expect(logs[0].source?.plannedFoodId).toBe(meal.foods[0].id);
    await repo.edit(owner, logs[0], 200, 'Cena');
    expect((await repo.day(owner, date))[0].grams).toBe(200);
    expect((await plans.latest(owner, plan.planId))).toEqual(snapshot);
    expect((await repo.undo(owner, receipt)).state).toBe('undone');
    expect(await repo.day(owner, date)).toEqual([]);
    expect((await repo.consume(owner, date, plan, meal, [175])).state).toBe('undone');
    expect(await repo.day(owner, date)).toEqual([]);
    expect((await db.open()).objectStoreNames).toHaveLength(13);
  });
  it('deduplicates a meal after a revision and rolls back all portions if the receipt cannot be written', async () => {
    const draft = mealDraft(owner); await plans.saveDraft(owner, draft, null); const first = await plans.save(owner, draft);
    const edited = mealDraft(owner, first.planId, first.id); edited.payload.content = structuredClone(first.content);
    edited.payload.content.notes = 'New note'; await plans.saveDraft(owner, edited, null); const next = await plans.save(owner, edited);
    const meal = next.content.weeks[0].days[0].meals[0];
    await expect(repo.consume(owner, date, first, first.content.weeks[0].days[0].meals[0], [100])).rejects.toMatchObject({ code: 'conflict' });
    const original = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'mealConsumptions') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(repo.consume(owner, date, next, meal, [175])).rejects.toMatchObject({ code: 'quota' });
    expect(await repo.day(owner, date)).toEqual([]); expect(await repo.receipts(owner, date)).toEqual([]);
    vi.restoreAllMocks(); const receipt = await repo.consume(owner, date, next, meal, [175]);
    const newerDraft = mealDraft(owner, next.planId, next.id); newerDraft.payload.content = structuredClone(next.content);
    newerDraft.payload.content.notes = 'Another note'; await plans.saveDraft(owner, newerDraft, null); const newer = await plans.save(owner, newerDraft);
    expect(await repo.consume(owner, date, newer, newer.content.weeks[0].days[0].meals[0], [900])).toEqual(receipt);
    expect(await repo.day(owner, date)).toHaveLength(1);
  });
  it('retains immutable snapshots, rejects invalid inputs and stale cross-tab edits', async () => {
    const custom = testFood(owner); const food = foodSnapshot(custom);
    if (custom.kind !== 'custom') throw new Error('Expected custom fixture');
    await (await db.open()).put('customFoods', custom.entry);
    const log = await repo.add(owner, date, 'Cena', food, 100);
    custom.entry.name = 'Updated source'; custom.entry.per100g.kcal = 999;
    expect((await repo.day(owner, date))[0].food).toEqual(food);
    await expect(repo.add(owner, date, 'Cena', food, Infinity)).rejects.toMatchObject({ code: 'invalid' });
    await expect(repo.add(owner, localDate('2026-09-21'), 'Cena', { ...food, per100g: { ...food.per100g, fat: NaN } }, 100)).rejects.toMatchObject({ code: 'invalid' });
    await expect(repo.add(owner, date, 'Cena', { ...food, source: { customFoodId: newId() } }, 100)).rejects.toMatchObject({ code: 'invalid' });
    const newer = await repo.edit(owner, log, 150, 'Cena');
    await expect(repo.edit(owner, log, 180, 'Cena')).rejects.toMatchObject({ code: 'conflict' });
    await expect(repo.remove(owner, log)).rejects.toMatchObject({ code: 'conflict' });
    await repo.remove(owner, newer); expect(await repo.day(owner, date)).toEqual([]);
  });
  it('isolates same-name people/modes, draft CAS and atomic quota rollback', async () => {
    const a = newId(), b = newId();
    for (const id of [a, b]) await people.savePerson(id, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null);
    await people.selectPerson(a);
    const now = new Date().toISOString(); const draft: DiaryDraft = { id: newId(), personId: a, createdAt: now, updatedAt: now,
      editorKey: `food-diary:${date}`, payload: { kind: 'food-diary', date, food: rice(a), grams: 100, mealLabel: 'Cena' } };
    await repo.saveDraft(a, draft, null, date);
    await expect(repo.saveDraft(a, { ...draft, payload: { ...draft.payload, grams: 110 } }, null, date)).rejects.toMatchObject({ code: 'conflict' });
    await expect(repo.add(b, date, 'Cena', rice(b), 100)).rejects.toMatchObject({ code: 'invalid' });
    expect(await repo.draft(b, date)).toBeNull();
    const original = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'foodLogs') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(repo.add(a, date, 'Cena', rice(a), 100, draft)).rejects.toMatchObject({ code: 'quota' });
    expect(await repo.draft(a, date)).toEqual(draft); expect(await repo.day(a, date)).toEqual([]);
    vi.restoreAllMocks(); await repo.add(a, date, 'Cena', rice(a), 100, draft);
    expect(await repo.draft(a, date)).toBeNull();
    await people.chooseMode('client'); await expect(repo.add(a, date, 'Cena', rice(a), 100)).rejects.toMatchObject({ code: 'invalid' });
    expect(await repo.day(b, date)).toEqual([]);
  });
  it('persists unfinished actual corrections and rolls back edit/draft cleanup together', async () => {
    const log = await repo.add(owner, date, 'Cena', rice(owner), 100);
    const now = new Date().toISOString();
    const draft: DiaryDraft = { id: newId(), personId: owner, editorKey: `food-diary:${date}`, createdAt: now, updatedAt: now,
      payload: { kind: 'food-diary', date, food: null, grams: null, mealLabel: 'Desayuno',
        edit: { base: log, grams: null, mealLabel: 'Cena' } } };
    await repo.saveDraft(owner, draft, null, date);
    expect((await repo.draft(owner, date))?.payload.edit?.grams).toBeNull();
    const changed = structuredClone(draft); changed.payload.edit!.grams = 175;
    await repo.saveDraft(owner, changed, draft, date);
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'foodLogs') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(repo.edit(owner, log, 175, 'Almuerzo', changed)).rejects.toMatchObject({ code: 'quota' });
    expect(await repo.draft(owner, date)).toEqual(changed); expect(await repo.day(owner, date)).toEqual([log]);
    vi.restoreAllMocks(); await repo.edit(owner, log, 175, 'Almuerzo', changed);
    expect(await repo.draft(owner, date)).toBeNull(); expect((await repo.day(owner, date))[0].grams).toBe(175);
  });
  it('reads saved daily target only and does not recalculate it when a food is added', async () => {
    const target = TestBed.inject(DailyTargetRepository);
    expect(await target.get(owner, date)).toBeNull();
    const context = activityContext(); const activity = initialActivity(context.profile);
    activity.mode = 'manual-tdee'; activity.manualKcal = 2100; activity.manualReason = 'User-supplied estimate';
    activity.goal = 'loss'; activity.adjustmentKcal = 300;
    activity.macros = { protein: 0, carbohydrate: 75, fat: 25 };
    const now = new Date().toISOString();
    const snapshot: DailyTargetSnapshot = { id: newId(), personId: owner, createdAt: now, updatedAt: now, date,
      schemaVersion: 2, version: 1, context, activity, calculation: calculateActivity(activity, context) };
    await (await db.open()).put('dailySnapshots', snapshot);
    await repo.add(owner, date, 'Cena', rice(owner), 100);
    const result = comparison(await repo.day(owner, date), await target.get(owner, date));
    expect(result.target?.kcal).toBe(1800); expect(result.target?.protein).toBe(0);
    expect(result.expenditure).toBe(2100); expect(result.adjustment).toBe(-300);
    expect(result.remaining?.protein).toBeLessThan(0); expect(result.provisional).toBe(false);
    expect(await target.get(owner, date)).toEqual(snapshot);
    expect(activityCatalog.entries.length).toBeGreaterThan(0);
  });
});
