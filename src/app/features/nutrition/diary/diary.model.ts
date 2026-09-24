import { localDate, type LocalDate } from '../../../core/domain/identity';
import type { DailyTargetSnapshot } from '../../activity/daily-target.model';
import type { FoodLog, Nutrients, PlannedMeal } from '../nutrition.model';
import { scaleFood } from '../foods/food.model';
import { totalFoods } from '../meal-plans/meal-planning';

export const emptyIntake = (): Nutrients => ({ kcal: 0, protein: 0, carbohydrate: 0, fat: 0 });
export function intake(logs: readonly FoodLog[]): Nutrients {
  return logs.reduce((sum, log) => {
    const value = scaleFood(log.food.per100g, log.grams);
    return { kcal: sum.kcal + value.kcal, protein: sum.protein + value.protein,
      carbohydrate: sum.carbohydrate + value.carbohydrate, fat: sum.fat + value.fat };
  }, emptyIntake());
}
export function comparison(logs: readonly FoodLog[], snapshot: DailyTargetSnapshot | null) {
  const actual = intake(logs);
  if (!snapshot) return { actual, target: null, remaining: null, expenditure: null, adjustment: null, provisional: null };
  const { targetKcal, macroGrams, expenditure } = snapshot.calculation.result;
  const target: Nutrients = { kcal: targetKcal, ...macroGrams };
  return { actual, target, remaining: { kcal: target.kcal - actual.kcal, protein: target.protein - actual.protein,
    carbohydrate: target.carbohydrate - actual.carbohydrate, fat: target.fat - actual.fat },
    expenditure: expenditure.expenditureKcal, adjustment: snapshot.calculation.input.signedAdjustmentKcal,
    provisional: expenditure.provisional };
}
export function ringProgress(value: number, target: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.max(0, value / target * 100));
}
export function mondayOf(date: LocalDate): LocalDate {
  const day = new Date(`${localDate(date)}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return localDate(day.toISOString().slice(0, 10));
}
export function weekDates(monday: LocalDate): LocalDate[] {
  const start = mondayOf(monday);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(`${start}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + index);
    return localDate(day.toISOString().slice(0, 10));
  });
}
export function plannedMealTotal(meal: PlannedMeal): Nutrients {
  return totalFoods(meal.foods);
}
