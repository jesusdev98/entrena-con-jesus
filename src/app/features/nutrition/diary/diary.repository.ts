import { Injectable, inject } from '@angular/core';
import type { IDBPTransaction } from 'idb';
import { localDate, newId, type LocalDate, type UUID } from '../../../core/domain/identity';
import { Database, StorageFailure, storageFailure } from '../../../core/storage/database';
import type { AppDatabase } from '../../../core/storage/database-schema';
import type { Draft } from '../../../core/storage/draft.model';
import { nutrientsSchema } from '../foods/food.model';
import { latestPlan } from '../meal-plans/meal-plans.repository';
import type { FoodLog, FoodSnapshot, MealConsumption, MealPlanRevision, PlannedMeal } from '../nutrition.model';

function validate(food: FoodSnapshot, grams: number, label: string, date: LocalDate): void {
  localDate(date);
  if (!Number.isFinite(grams) || grams <= 0 || !label.trim() || label.length > 160 ||
    !food?.foodId || !food.name?.trim() || food.name.length > 160 ||
    !food.source || !(('fdcId' in food.source && !!food.source.fdcId && !!food.source.version) ||
      ('customFoodId' in food.source && !!food.source.customFoodId)) || !nutrientsSchema.safeParse(food.per100g).success)
    throw new StorageFailure('invalid', 'Indica fecha, comida, alimento, origen y gramos positivos con valores nutricionales válidos.');
}
function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
export type DiaryDraft = Draft & { payload: Extract<Draft['payload'], { kind: 'food-diary' }> };
const stores = ['settings', 'people', 'foodLogs', 'mealConsumptions', 'mealPlanRevisions', 'drafts', 'customFoods'] as const;
type Transaction = IDBPTransaction<AppDatabase, typeof stores, 'readwrite'>;

@Injectable({ providedIn: 'root' })
export class DiaryRepository {
  private readonly database = inject(Database);
  async draft(owner: UUID, date: LocalDate): Promise<DiaryDraft | null> {
    localDate(date);
    const value = await (await this.database.open()).getFromIndex('drafts', 'by-editor', [owner, `food-diary:${date}`]);
    if (value && value.payload.kind !== 'food-diary') throw new StorageFailure('invalid', 'El borrador tiene un formato incompatible.');
    return value as DiaryDraft ?? null;
  }
  async saveDraft(owner: UUID, next: DiaryDraft | null, previous: DiaryDraft | null, date: LocalDate): Promise<void> {
    localDate(date);
    if ([next, previous].some(item => item && (item.personId !== owner || item.editorKey !== `food-diary:${date}` || item.payload.kind !== 'food-diary' || item.payload.date !== date)) ||
      (next && previous && next.id !== previous.id)) throw new StorageFailure('invalid', 'El borrador pertenece a otra persona o fecha.');
    await this.write(owner, async tx => {
      const stored = await tx.objectStore('drafts').index('by-editor').get([owner, `food-diary:${date}`]) ?? null;
      if (!same(stored, previous)) throw new StorageFailure('conflict', 'El borrador cambió en otra pestaña. Actualiza antes de continuar.');
      if (next) await tx.objectStore('drafts').put(structuredClone(next));
      else if (stored) await tx.objectStore('drafts').delete([owner, stored.id]);
    });
  }
  async day(owner: UUID, date: LocalDate): Promise<FoodLog[]> {
    localDate(date);
    return (await (await this.database.open()).getAllFromIndex('foodLogs', 'by-person-date', [owner, date])).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async week(owner: UUID, dates: LocalDate[]): Promise<FoodLog[]> {
    return (await Promise.all(dates.map(date => this.day(owner, date)))).flat();
  }
  async receipts(owner: UUID, date: LocalDate): Promise<MealConsumption[]> {
    localDate(date);
    return (await (await this.database.open()).getAllFromIndex('mealConsumptions', 'by-person-date', [owner, date]));
  }
  async add(owner: UUID, date: LocalDate, mealLabel: string, food: FoodSnapshot, grams: number, draft: DiaryDraft | null = null): Promise<FoodLog> {
    validate(food, grams, mealLabel, date);
    if (draft && (draft.personId !== owner || draft.payload.date !== date || draft.editorKey !== `food-diary:${date}`)) throw new StorageFailure('invalid', 'El borrador pertenece a otra fecha o persona.');
    return this.write(owner, async tx => {
      if ('customFoodId' in food.source && !await tx.objectStore('customFoods').get([owner, food.source.customFoodId]))
        throw new StorageFailure('invalid', 'Este alimento personalizado no pertenece a la persona activa.');
      if (draft) {
        const stored = await tx.objectStore('drafts').index('by-editor').get([owner, `food-diary:${date}`]) ?? null;
        if (!same(stored, draft)) throw new StorageFailure('conflict', 'El borrador cambió. Actualiza antes de registrar.');
        await tx.objectStore('drafts').delete([owner, draft.id]);
      }
      const now = new Date().toISOString();
      const log: FoodLog = { id: newId(), personId: owner, createdAt: now, updatedAt: now,
        date, mealLabel: mealLabel.trim(), food: structuredClone(food), grams, source: null };
      await tx.objectStore('foodLogs').add(log);
      return log;
    });
  }
  async edit(owner: UUID, previous: FoodLog, grams: number, mealLabel: string, draft: DiaryDraft | null = null): Promise<FoodLog> {
    if (previous.personId !== owner) throw new StorageFailure('invalid', 'El registro pertenece a otra persona.');
    validate(previous.food, grams, mealLabel, previous.date);
    if (draft && (draft.personId !== owner || draft.payload.date !== previous.date || draft.editorKey !== `food-diary:${previous.date}` ||
      !same(draft.payload.edit?.base, previous))) throw new StorageFailure('invalid', 'El borrador de edición pertenece a otra entrada.');
    return this.write(owner, async tx => {
      const stored = await tx.objectStore('foodLogs').get([owner, previous.id]);
      if (!stored || !same(stored, previous)) throw new StorageFailure('conflict', 'El registro cambió en otra pestaña. Actualiza el diario antes de editar.');
      if (draft) {
        const savedDraft = await tx.objectStore('drafts').index('by-editor').get([owner, draft.editorKey]) ?? null;
        if (!same(savedDraft, draft)) throw new StorageFailure('conflict', 'El borrador cambió en otra pestaña.');
        const manual = draft.payload.food || draft.payload.grams !== null || draft.payload.mealLabel !== 'Desayuno';
        if (manual) await tx.objectStore('drafts').put({ ...structuredClone(draft), updatedAt: new Date().toISOString(), payload: { ...draft.payload, edit: null } });
        else await tx.objectStore('drafts').delete([owner, draft.id]);
      }
      const updated: FoodLog = { ...stored, grams, mealLabel: mealLabel.trim(), updatedAt: new Date().toISOString() };
      await tx.objectStore('foodLogs').put(updated);
      return updated;
    });
  }
  async remove(owner: UUID, previous: FoodLog): Promise<void> {
    if (previous.personId !== owner) throw new StorageFailure('invalid', 'El registro pertenece a otra persona.');
    await this.write(owner, async tx => {
      const stored = await tx.objectStore('foodLogs').get([owner, previous.id]);
      if (!stored || !same(stored, previous)) throw new StorageFailure('conflict', 'El registro cambió. Actualiza el diario antes de eliminar.');
      await tx.objectStore('foodLogs').delete([owner, previous.id]);
    });
  }
  async consume(owner: UUID, date: LocalDate, revision: MealPlanRevision, meal: PlannedMeal,
    grams: number[]): Promise<MealConsumption> {
    localDate(date);
    if (revision.personId !== owner || !meal.foods.length || !revision.content.weeks.some(week => week.days.some(day => day.meals.some(item => item.id === meal.id))) ||
      grams.length !== meal.foods.length) throw new StorageFailure('invalid', 'Selecciona una comida guardada de esta persona.');
    meal.foods.forEach((food, index) => validate(food.food, grams[index], meal.name, date));
    return this.write(owner, async tx => {
      const plans = await tx.objectStore('mealPlanRevisions').index('by-person').getAll(owner);
      const head = latestPlan(plans, revision.planId);
      if (!head || head.archived || !same(head, revision)) throw new StorageFailure('conflict', 'El plan cambió. Actualiza la comida antes de registrarla.');
      const saved = head.content.weeks.flatMap(week => week.days).flatMap(day => day.meals).find(item => item.id === meal.id);
      if (!saved || !same(saved, meal)) throw new StorageFailure('conflict', 'La comida cambió en el plan. Actualiza antes de registrarla.');
      const store = tx.objectStore('mealConsumptions');
      const receipts = await store.index('by-person-date').getAll([owner, date]);
      const existing = receipts.find(item => item.planId === revision.planId && item.mealId === meal.id) ??
        await store.index('by-source').get([owner, date, revision.id, meal.id]);
      if (existing) return existing;
      const now = new Date().toISOString(), id = newId();
      const logs: FoodLog[] = meal.foods.map((item, index) => ({ id: newId(), personId: owner, date,
        createdAt: now, updatedAt: now, mealLabel: meal.name, food: structuredClone(item.food), grams: grams[index],
        source: { planId: revision.planId, revisionId: revision.id, mealId: meal.id, plannedFoodId: item.id, consumptionId: id } }));
      const receipt: MealConsumption = { id, personId: owner, createdAt: now, updatedAt: now, date,
        planId: revision.planId, revisionId: revision.id, mealId: meal.id, state: 'consumed', foodLogIds: logs.map(log => log.id) };
      for (const log of logs) await tx.objectStore('foodLogs').add(log);
      await store.add(receipt);
      return receipt;
    });
  }
  async undo(owner: UUID, previous: MealConsumption): Promise<MealConsumption> {
    if (previous.personId !== owner) throw new StorageFailure('invalid', 'La comida pertenece a otra persona.');
    return this.write(owner, async tx => {
      const store = tx.objectStore('mealConsumptions');
      const saved = await store.get([owner, previous.id]);
      if (!saved || !same(saved, previous)) throw new StorageFailure('conflict', 'La comida cambió. Actualiza el diario antes de deshacer.');
      if (saved.state !== 'consumed') return saved;
      for (const id of saved.foodLogIds) {
        const log = await tx.objectStore('foodLogs').get([owner, id]);
        if (log) {
          if (log.source?.consumptionId !== saved.id || log.date !== saved.date) throw new StorageFailure('conflict', 'Los registros vinculados cambiaron. No se ha deshecho la comida.');
          await tx.objectStore('foodLogs').delete([owner, id]);
        }
      }
      const undone: MealConsumption = { ...saved, state: 'undone', updatedAt: new Date().toISOString() };
      await store.put(undone);
      return undone;
    });
  }
  private async write<T>(owner: UUID, action: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx = (await this.database.open()).transaction(stores, 'readwrite');
    try {
      const settings = await tx.objectStore('settings').get('workspace');
      const person = await tx.objectStore('people').get(owner);
      if (!settings?.mode || settings.activePersonId !== owner || !person || person.archived || (settings.mode === 'client' && settings.personalPersonId !== owner))
        throw new StorageFailure('invalid', 'La persona activa cambió. Vuelve a su espacio para guardar.');
      const result = await action(tx); await tx.done; return result;
    } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await tx.done.catch(() => undefined); throw storageFailure(error); }
  }
}
