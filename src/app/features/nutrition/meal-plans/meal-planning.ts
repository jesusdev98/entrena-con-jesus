import { newId, type UUID } from '../../../core/domain/identity';
import { scaleFood, foodSnapshot, type FoodChoice } from '../foods/food.model';
import type { FoodSnapshot, MealPlanContent, MealPlanDay, MealPlanWeek, Nutrients, PlannedFood, PlannedMeal } from '../nutrition.model';

export const emptyNutrients = (): Nutrients => ({ kcal: 0, protein: 0, carbohydrate: 0, fat: 0 });
export function totalFoods(foods: readonly PlannedFood[]): Nutrients {
  return foods.reduce((total, item) => {
    const value = scaleFood(item.food.per100g, item.grams);
    return { kcal: total.kcal + value.kcal, protein: total.protein + value.protein,
      carbohydrate: total.carbohydrate + value.carbohydrate, fat: total.fat + value.fat };
  }, emptyNutrients());
}
export const totalMeals = (meals: readonly PlannedMeal[]) => totalFoods(meals.flatMap(meal => meal.foods));
export const totalDays = (days: readonly MealPlanDay[]) => totalMeals(days.flatMap(day => day.meals));
export const totalWeeks = (weeks: readonly MealPlanWeek[]) => totalDays(weeks.flatMap(week => week.days));
/** Incomplete grams remain recoverable; the preview counts only completed portions. */
export const previewTotal = (weeks: readonly MealPlanWeekDraft[]) => totalFoods(weeks.flatMap(week => week.days).flatMap(day => day.meals)
  .flatMap(meal => meal.foods).filter((item): item is PlannedFood => item.grams !== null && item.grams > 0 && Number.isFinite(item.grams)));

export function newMeal(name = 'Comida'): PlannedMeal { return { id: newId(), name, foods: [] }; }
export function newDay(name = 'Lunes'): MealPlanDay { return { id: newId(), name, meals: ['Desayuno', 'Almuerzo', 'Cena', 'Colaciones'].map(label => newMeal(label)) }; }
export function newWeek(): MealPlanWeek { return { id: newId(), name: 'Semana', days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(newDay) }; }
export function newPlannedFood(choice: FoodChoice, grams: number | null = null): PlannedFoodDraft {
  return { id: newId(), food: foodSnapshot(choice), grams };
}
export type PlannedFoodDraft = Omit<PlannedFood, 'grams'> & { grams: number | null };
export type MealPlanContentDraft = Omit<MealPlanContent, 'weeks'> & { weeks: MealPlanWeekDraft[] };
export type MealPlanWeekDraft = Omit<MealPlanWeek, 'days'> & { days: MealPlanDayDraft[] };
export type MealPlanDayDraft = Omit<MealPlanDay, 'meals'> & { meals: PlannedMealDraft[] };
export type PlannedMealDraft = Omit<PlannedMeal, 'foods'> & { foods: PlannedFoodDraft[] };

export function duplicateFood(value: PlannedFoodDraft): PlannedFoodDraft { return { id: newId(), food: structuredClone(value.food), grams: value.grams }; }
export function duplicateMeal(value: PlannedMealDraft): PlannedMealDraft { return { id: newId(), name: value.name, foods: value.foods.map(duplicateFood) }; }
export function duplicateDay(value: MealPlanDayDraft): MealPlanDayDraft { return { id: newId(), name: value.name, meals: value.meals.map(duplicateMeal) }; }
export function duplicateWeek(value: MealPlanWeekDraft): MealPlanWeekDraft { return { id: newId(), name: value.name, days: value.days.map(duplicateDay) }; }
export function duplicateContent(value: MealPlanContentDraft): MealPlanContentDraft { return { notes: value.notes, weeks: value.weeks.map(duplicateWeek) }; }
export type RowAction = 'up' | 'down' | 'duplicate' | 'remove';
export function editRows<T extends { id: UUID }>(rows: T[], id: UUID, action: RowAction, duplicate: (row: T) => T): T[] {
  const index = rows.findIndex(row => row.id === id);
  if (index < 0) return rows;
  const result = [...rows];
  if (action === 'duplicate') result.splice(index + 1, 0, duplicate(rows[index]));
  else if (action === 'remove') result.splice(index, 1);
  else {
    const target = index + (action === 'up' ? -1 : 1);
    if (target < 0 || target >= result.length) return rows;
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
const label = (text: unknown) => typeof text === 'string' && !!text.trim() && text.length <= 160;
const nutrients = (value: FoodSnapshot) => value && value.per100g && value.source &&
  (['kcal', 'protein', 'carbohydrate', 'fat'] as const).every(key => Number.isFinite(value.per100g[key]) && value.per100g[key] >= 0) &&
  label(value.name) && typeof value.foodId === 'string' && !!value.foodId &&
  (('fdcId' in value.source && !!value.source.fdcId && !!value.source.version) || ('customFoodId' in value.source && !!value.source.customFoodId));
export function planErrors(name: string, content: MealPlanContentDraft): string[] {
  const errors: string[] = [];
  const ids = new Set<UUID>();
  const unique = (id: UUID) => { if (!id || ids.has(id)) errors.push('Las semanas, días, comidas y alimentos necesitan identidades únicas.'); ids.add(id); };
  if (!label(name)) errors.push('Indica un nombre de plan de 1 a 160 caracteres.');
  if (typeof content?.notes !== 'string' || content.notes.length > 2000) errors.push('Las notas admiten hasta 2000 caracteres.');
  if (!content?.weeks?.length) errors.push('Añade al menos una semana.');
  content?.weeks?.forEach((week, wi) => {
    unique(week.id);
    if (!label(week.name)) errors.push(`Semana ${wi + 1}: indica una etiqueta.`);
    if (!week.days.length) errors.push(`Semana ${wi + 1}: añade un día.`);
    week.days.forEach((day, di) => {
      unique(day.id);
      if (!label(day.name)) errors.push(`Día ${di + 1}: indica una etiqueta.`);
      if (!day.meals.length) errors.push(`Día ${di + 1}: añade una comida.`);
      day.meals.forEach((meal, mi) => {
        unique(meal.id);
        if (!label(meal.name)) errors.push(`Comida ${mi + 1}: indica una etiqueta.`);
        meal.foods.forEach(food => {
          unique(food.id);
          if (!nutrients(food.food)) errors.push('Alimento: valores u origen inválidos.');
          if (typeof food.grams !== 'number' || !Number.isFinite(food.grams) || food.grams <= 0) errors.push('Indica gramos mayores que cero para cada alimento.');
        });
      });
    });
  });
  return errors;
}
export function savedContent(name: string, content: MealPlanContentDraft): MealPlanContent {
  const errors = planErrors(name, content);
  if (errors.length) throw new Error(errors.join('\n'));
  return structuredClone(content) as MealPlanContent;
}
