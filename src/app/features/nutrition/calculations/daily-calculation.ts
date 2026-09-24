import type { EnergyInput } from '../../activity/energy-input';
import type { MetCatalog } from '../../activity/met-catalog';
import type { MacroPercentages } from '../../people/person.model';
import { dailyExpenditure } from './daily-expenditure';
import { calorieTarget, macroTargets, MACRO_VERSION } from './macro-targets';

export interface DailyCalculationInput {
  energy: EnergyInput;
  signedAdjustmentKcal: number;
  macroPercentages: MacroPercentages;
}
type Immutable<T> = T extends object ? { readonly [Key in keyof T]: Immutable<T[Key]> } : T;
function freeze<T>(value: T): Immutable<T> {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(child => freeze(child));
    Object.freeze(value);
  }
  return value as Immutable<T>;
}
/** Detached, immutable calculation payload. A later repository supplies person/date/revision IDs. */
export function calculateDailyTargets(input: DailyCalculationInput, catalog?: MetCatalog) {
  const captured = structuredClone(input);
  const expenditure = dailyExpenditure(captured.energy, catalog);
  const targetKcal = calorieTarget(expenditure.expenditureKcal, captured.signedAdjustmentKcal);
  return freeze({ schemaVersion: 1 as const, input: captured,
    result: { expenditure, targetKcal, macroGrams: macroTargets(targetKcal, captured.macroPercentages), macroVersion: MACRO_VERSION } });
}
