import { newId, type UUID } from '../../../core/domain/identity';
import type { CustomFood } from '../nutrition.model';
import { customChoice, type FoodChoice } from '../foods/food.model';
import { newPlannedFood, newWeek, type MealPlanWeekDraft } from './meal-planning';
import type { MealPlanDraft } from './meal-plans.repository';

export function testFood(owner: UUID): FoodChoice {
  const entry: CustomFood = { id: newId(), personId: owner, createdAt: '2026-01-01', updatedAt: '2026-01-01', name: 'Arroz propio',
    per100g: { kcal: 130, protein: 2.5, carbohydrate: 28, fat: 0.3 } };
  return customChoice(entry);
}
export function mealDraft(owner: UUID, planId = newId(), baseRevisionId: UUID | null = null): MealPlanDraft {
  const week: MealPlanWeekDraft = newWeek(); week.days[0].meals[0].foods.push(newPlannedFood(testFood(owner), 150));
  const now = new Date().toISOString();
  return { id: newId(), personId: owner, editorKey: `meal-plan:${planId}`, createdAt: now, updatedAt: now,
    payload: { kind: 'meal-plan', planId, baseRevisionId, name: 'Plan mixto', content: { weeks: [week], notes: '' } } };
}
