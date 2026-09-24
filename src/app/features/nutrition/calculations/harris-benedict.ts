import { positive, requireCalculation } from './calculation-error';

export const HARRIS_BENEDICT_VERSION = 'revised-harris-benedict-1984' as const;
export interface EnergyProfile {
  age: number | null;
  formulaSex: 'male' | 'female' | null;
  weightKg: number | null;
  heightCm: number | null;
  /** Explicit opt-out for profiles outside this product's estimation scope. */
  estimationScope?: 'general-adult' | 'manual-only';
}
export function harrisBenedict(profile: EnergyProfile): number {
  requireCalculation(profile && profile.age != null && profile.formulaSex != null && profile.weightKg != null && profile.heightCm != null,
    'missing-profile', 'Completa edad, sexo de la fórmula, peso y altura, o introduce un gasto diario manual.');
  const { age, formulaSex, weightKg, heightCm } = profile;
  positive(age, 'Edad'); positive(weightKg, 'Peso'); positive(heightCm, 'Altura');
  requireCalculation(age >= 19 && (formulaSex === 'male' || formulaSex === 'female') &&
    (profile.estimationScope === undefined || profile.estimationScope === 'general-adult'),
  'unsupported-profile', 'Este perfil no está cubierto por la estimación. Introduce un gasto diario manual.');
  const bmr = formulaSex === 'male'
    ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
    : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.330 * age;
  return positive(bmr, 'Metabolismo basal estimado');
}
