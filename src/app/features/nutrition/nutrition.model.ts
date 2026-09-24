import type { LocalDate, OwnedRecord, Revision, UUID } from '../../core/domain/identity';
import type { PlanOrigin, ProgressOrigin } from '../transfers/transfer.model';

export interface Nutrients { kcal: number; protein: number; carbohydrate: number; fat: number }
export interface FoodSnapshot {
  foodId: string;
  name: string;
  per100g: Nutrients;
  source: { fdcId: string; version: string } | { customFoodId: UUID };
}
export interface CustomFood extends OwnedRecord {
  name: string;
  per100g: Nutrients;
  /** Optional fields keep existing local records readable without a database migration. */
  archived?: boolean;
  source?: { kind: 'user'; note: string };
}
export interface CustomFoodFormValue {
  name: string;
  note: string;
  kcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
}
export interface PlannedFood { id: UUID; food: FoodSnapshot; grams: number }
export interface PlannedMeal { id: UUID; name: string; foods: PlannedFood[] }
export interface MealPlanDay { id: UUID; name: string; meals: PlannedMeal[] }
export interface MealPlanWeek { id: UUID; name: string; days: MealPlanDay[] }
export interface MealPlanContent { weeks: MealPlanWeek[]; notes: string }
export interface MealPlanRevision extends Revision { readonly content: MealPlanContent; readonly archived?: boolean; readonly exchange?: PlanOrigin }
export interface FoodLog extends OwnedRecord {
  exchange?: ProgressOrigin;
  date: LocalDate;
  mealLabel: string;
  food: FoodSnapshot;
  grams: number;
  source: { planId: UUID; revisionId: UUID; mealId: UUID; plannedFoodId: UUID; consumptionId: UUID } | null;
}
/** One receipt per person/date/planned meal; retained on undo to prevent accidental retransfers. */
export interface MealConsumption extends OwnedRecord {
  date: LocalDate;
  planId?: UUID;
  revisionId: UUID;
  mealId: UUID;
  state: 'consumed' | 'undone';
  foodLogIds: UUID[];
}
