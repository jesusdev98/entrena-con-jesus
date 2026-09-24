export type CalculationErrorCode = 'missing-profile' | 'unsupported-profile' | 'invalid-number' |
  'missing-activity' | 'invalid-steps' | 'duplicate-activity' | 'invalid-duration' | 'clock-overlap' |
  'invalid-catalog' | 'manual-required' | 'invalid-target' | 'invalid-macros' | 'invalid-input';

export class CalculationError extends Error {
  constructor(readonly code: CalculationErrorCode, message: string) { super(message); this.name = 'CalculationError'; }
}
export function requireCalculation(condition: unknown, code: CalculationErrorCode, message: string): asserts condition {
  if (!condition) throw new CalculationError(code, message);
}
export function finite(value: number, field: string): number {
  requireCalculation(typeof value === 'number' && Number.isFinite(value), 'invalid-number', `${field}: debe ser un número finito.`);
  return value;
}
export function nonnegative(value: number, field: string): number {
  finite(value, field);
  requireCalculation(value >= 0, 'invalid-number', `${field}: no puede ser negativo.`);
  return value;
}
export function positive(value: number, field: string): number {
  nonnegative(value, field);
  requireCalculation(value > 0, 'invalid-number', `${field}: debe ser mayor que cero.`);
  return value;
}
