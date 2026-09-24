import type { MacroPercentages } from '../../people/person.model';
import type { Nutrients } from '../nutrition.model';
import { finite, nonnegative, positive, requireCalculation } from './calculation-error';

export const MACRO_VERSION = 'energy-offset-percent-4-4-9-v1' as const;
export function calorieTarget(expenditureKcal: number, signedAdjustmentKcal: number): number {
  positive(expenditureKcal, 'Gasto diario'); finite(signedAdjustmentKcal, 'Ajuste calórico');
  const target = finite(expenditureKcal + signedAdjustmentKcal, 'Objetivo calórico');
  requireCalculation(target > 0, 'invalid-target', 'El objetivo calórico debe ser mayor que cero. Revisa el ajuste de déficit o superávit.');
  return target;
}
export function macroTargets(targetKcal: number, percentages: MacroPercentages): MacroPercentages {
  positive(targetKcal, 'Objetivo calórico');
  const { protein, carbohydrate, fat } = percentages;
  [protein, carbohydrate, fat].forEach(value => nonnegative(value, 'Porcentaje de macronutrientes'));
  requireCalculation(Math.abs(protein + carbohydrate + fat - 100) <= 1e-9, 'invalid-macros', 'Los porcentajes de macronutrientes deben sumar 100 %.');
  return { protein: nonnegative(targetKcal * (protein / 100) / 4, 'Proteínas'),
    carbohydrate: nonnegative(targetKcal * (carbohydrate / 100) / 4, 'Carbohidratos'),
    fat: nonnegative(targetKcal * (fat / 100) / 9, 'Grasas') };
}
export interface TargetProgress {
  remaining: number; excess: number; signedRemaining: number;
  /** Null means a zero target; never divide by zero or hide an excess. */
  ratio: number | null; ringFraction: number;
}
export function targetProgress(target: number, consumed: number): TargetProgress {
  nonnegative(target, 'Objetivo'); nonnegative(consumed, 'Consumo');
  const signedRemaining = target - consumed;
  const rawRatio = target === 0 ? null : consumed / target;
  return { signedRemaining, remaining: Math.max(0, signedRemaining), excess: Math.max(0, -signedRemaining),
    ratio: rawRatio === null || !Number.isFinite(rawRatio) ? null : rawRatio,
    ringFraction: target === 0 ? (consumed > 0 ? 1 : 0) : Math.min(1, consumed / target) };
}
/** Use only actual food-log portions here; planned meals are a separate future consumer. */
export function sumFoodPortions(portions: readonly { per100g: Nutrients; grams: number }[]): Nutrients {
  const totals: Nutrients = { kcal: 0, protein: 0, carbohydrate: 0, fat: 0 };
  for (const portion of portions) {
    const scale = nonnegative(portion.grams, 'Gramos') / 100;
    for (const key of ['kcal', 'protein', 'carbohydrate', 'fat'] as const) {
      totals[key] = nonnegative(totals[key] + nonnegative(portion.per100g[key], 'Valor nutricional') * scale, 'Total nutricional');
    }
  }
  return totals;
}
