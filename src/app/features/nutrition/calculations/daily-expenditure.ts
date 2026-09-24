import type { ActivityGroup, DayInterval, EnergyBlock, EnergyInput, ForecastActual, WalkingInput } from '../../activity/energy-input';
import { parseMetCatalog, resolveMet, type MetCatalog, type SourcedMet } from '../../activity/met-catalog';
import { finite, nonnegative, positive, requireCalculation } from './calculation-error';
import { harrisBenedict, HARRIS_BENEDICT_VERSION } from './harris-benedict';

export const ENERGY_VERSION = 'revised-hb-1984-net-met-v1' as const;
export const DEFAULT_WALKING_CADENCE = 100;
export const DEFAULT_ADULT_WALKING_ID = 'adult:17170';
export const THERMIC_FRACTION = 0.1;
export type Selected<T> = { status: 'missing' } | { status: 'forecast' | 'actual'; value: T };
export function selectDailyValue<T>(input: ForecastActual<T>): Selected<T> {
  if (input.actual != null) return { status: 'actual', value: structuredClone(input.actual) };
  if (input.forecast != null) return { status: 'forecast', value: structuredClone(input.forecast) };
  return { status: 'missing' };
}
function requiredValue<T>(input: ForecastActual<T>): Exclude<Selected<T>, { status: 'missing' }> {
  const selected = selectDailyValue(input);
  requireCalculation(selected.status !== 'missing', 'missing-activity', 'Completa los pasos y los bloques diarios; usa cero o una lista vacía para un día de descanso.');
  return selected;
}
export interface BlockEnergy {
  id: string;
  kind: 'work' | 'training' | 'walking';
  minutes: number;
  grossKcal: number | null;
  restingKcal: number;
  netKcal: number;
  activity: SourcedMet | null;
  manualReason: string | null;
  linkedTrainingSessionId: string | null;
}
export interface EstimatedExpenditure {
  mode: 'estimated'; version: typeof ENERGY_VERSION; restingFormula: typeof HARRIS_BENEDICT_VERSION;
  bmrKcal: number; netActivityKcal: number; expenditureKcal: number; thermicFraction: 0.1;
  totalMinutes: number; residualSteps: number; blocks: BlockEnergy[]; provisional: boolean;
  selection: { totalSteps: 'forecast' | 'actual'; work: 'forecast' | 'actual'; training: 'forecast' | 'actual'; walking: 'forecast' | 'actual' | 'default' };
  walking: { minutes: number; stepsPerMinute: number | null; activityId: string | null; method: 'cadence' | 'duration' };
  timing: { assumption: 'distinct-durations'; checkedIntervals: number; coverage: 'none' | 'partial' | 'complete' };
}
export interface ManualExpenditure {
  mode: 'manual-tdee'; version: 'manual-tdee-v1'; expenditureKcal: number; thermicFraction: 0; reason: string; provisional: false;
}
export type ExpenditureResult = EstimatedExpenditure | ManualExpenditure;

export function metBlockEnergy(activity: SourcedMet, weightKg: number, minutes: number, bmrKcal: number) {
  positive(weightKg, 'Peso'); nonnegative(minutes, 'Duración'); positive(bmrKcal, 'Metabolismo basal');
  requireCalculation(minutes <= 1440, 'invalid-duration', 'La duración supera un día.');
  // Also reject a manually corrupted oxygen reference before performing arithmetic.
  parseMetCatalog({ version: 1, edition: '2024', language: 'es', entries: [activity] });
  const grossKcal = nonnegative(activity.met * activity.referenceMlO2PerKgMin * weightKg / 200 * minutes, 'Gasto bruto');
  const restingKcal = nonnegative(bmrKcal / 1440 * minutes, 'Gasto basal del bloque');
  return { grossKcal, restingKcal, netKcal: Math.max(0, grossKcal - restingKcal) };
}
function reason(value: string): string {
  requireCalculation(typeof value === 'string' && !!value.trim(), 'invalid-input', 'Indica el motivo o la fuente del gasto manual.');
  return value.trim();
}
function validateInterval(interval: DayInterval, minutes: number): void {
  nonnegative(interval.startMinute, 'Inicio'); nonnegative(interval.endMinute, 'Fin');
  requireCalculation(interval.endMinute <= 1440 && interval.endMinute >= interval.startMinute &&
    Math.abs(interval.endMinute - interval.startMinute - minutes) <= 1e-9, 'invalid-duration', 'El intervalo debe coincidir con la duración y estar dentro del día.');
}
function validateGroup(group: ActivityGroup): void {
  nonnegative(group.includedSteps, 'Pasos incluidos');
  requireCalculation(Array.isArray(group.blocks), 'invalid-input', 'Los bloques diarios no son válidos.');
  group.blocks.forEach(block => nonnegative(block.minutes, 'Duración'));
  requireCalculation(group.includedSteps === 0 || group.blocks.some(block => block.minutes > 0),
    'invalid-steps', 'Los pasos incluidos necesitan un bloque con duración mayor que cero.');
}

/** No food argument: a meal cannot change estimated expenditure. */
export function dailyExpenditure(input: EnergyInput, rawCatalog?: MetCatalog): ExpenditureResult {
  if (input.mode === 'manual-tdee') {
    return { mode: 'manual-tdee', version: 'manual-tdee-v1', expenditureKcal: positive(input.expenditureKcal, 'Gasto diario manual'),
      thermicFraction: 0, reason: reason(input.reason), provisional: false };
  }
  requireCalculation(input.mode === 'estimated', 'invalid-input', 'Modo de cálculo no compatible.');
  const bmrKcal = harrisBenedict(input.profile);
  const age = input.profile.age as number, weightKg = input.profile.weightKg as number;
  // A caller can calculate a rest day or manual-net-only day without loading a catalog.
  const catalog = rawCatalog ? parseMetCatalog(rawCatalog) : null;
  const met = (id: string) => {
    requireCalculation(catalog, 'manual-required', 'Carga el catálogo MET o introduce un gasto manual.');
    return resolveMet(catalog, id, age);
  };
  const totalSteps = requiredValue(input.totalSteps), work = requiredValue(input.work), training = requiredValue(input.training);
  nonnegative(totalSteps.value, 'Pasos totales');
  validateGroup(work.value); validateGroup(training.value);
  const residualSteps = finite(totalSteps.value - work.value.includedSteps - training.value.includedSteps, 'Pasos adicionales');
  requireCalculation(residualSteps >= 0, 'invalid-steps', 'Los pasos de trabajo y entrenamiento superan los pasos totales.');
  const ids = new Set<string>(), sessions = new Set<string>(), intervals: DayInterval[] = [], blocks: BlockEnergy[] = [];
  let timedBlocks = 0;
  function add(block: EnergyBlock, kind: BlockEnergy['kind']) {
    requireCalculation(typeof block.id === 'string' && !!block.id.trim() && !ids.has(block.id), 'duplicate-activity', 'Cada bloque debe tener una identidad única.');
    ids.add(block.id);
    nonnegative(block.minutes, 'Duración');
    requireCalculation(block.minutes <= 1440, 'invalid-duration', 'La duración supera un día.');
    if (block.minutes > 0) timedBlocks++;
    if (block.interval) {
      validateInterval(block.interval, block.minutes);
      if (block.minutes > 0) intervals.push(block.interval);
    }
    const sessionId = block.linkedTrainingSessionId ?? null;
    if (sessionId !== null) {
      requireCalculation(kind === 'training' && typeof sessionId === 'string' && !!sessionId.trim() && !sessions.has(sessionId),
        'duplicate-activity', 'Una sesión vinculada solo puede contarse una vez y como entrenamiento.');
      sessions.add(sessionId);
    }
    const common = { id: block.id, kind, minutes: block.minutes, linkedTrainingSessionId: sessionId };
    if (block.expenditure.mode === 'met') {
      const activity = met(block.expenditure.activityId);
      blocks.push({ ...common, ...metBlockEnergy(activity, weightKg, block.minutes, bmrKcal), activity, manualReason: null });
    } else {
      requireCalculation(block.expenditure.mode === 'manual-net', 'invalid-input', 'Tipo de gasto del bloque no compatible.');
      const netKcal = nonnegative(block.expenditure.netKcal, 'Gasto neto manual');
      requireCalculation(block.minutes > 0 || netKcal === 0, 'invalid-duration', 'Un gasto positivo necesita una duración positiva.');
      blocks.push({ ...common, grossKcal: null, restingKcal: bmrKcal / 1440 * block.minutes,
        netKcal, activity: null, manualReason: reason(block.expenditure.reason) });
    }
  }
  work.value.blocks.forEach(block => add(block, 'work'));
  training.value.blocks.forEach(block => add(block, 'training'));
  const walkingSelected = selectDailyValue(input.walking ?? {});
  const walking: WalkingInput = walkingSelected.status === 'missing' ? { mode: 'cadence' } : walkingSelected.value;
  requireCalculation(walking.mode === 'cadence' || walking.mode === 'duration', 'invalid-input', 'Modo de caminata no compatible.');
  const cadence = walking.mode === 'cadence' ? positive(walking.stepsPerMinute ?? DEFAULT_WALKING_CADENCE, 'Cadencia') : null;
  const walkingMinutes = nonnegative(walking.mode === 'duration' ? walking.minutes : residualSteps / (cadence as number), 'Duración de caminata');
  requireCalculation(residualSteps === 0 ? walkingMinutes === 0 : walkingMinutes > 0, 'invalid-steps', 'La duración de caminata debe corresponder a los pasos adicionales.');
  let walkingId = walking.activityId ?? null;
  if (walkingMinutes > 0) {
    requireCalculation(walkingId || age < 60, 'manual-required', 'Selecciona una caminata de la tabla de 60 años o más, o introduce un gasto manual.');
    walkingId ??= DEFAULT_ADULT_WALKING_ID;
    requireCalculation(met(walkingId).category === 'walking', 'invalid-input', 'Selecciona un código de caminata para los pasos adicionales.');
    add({ id: 'residual-walking', minutes: walkingMinutes, expenditure: { mode: 'met', activityId: walkingId },
      ...(walking.mode === 'duration' && walking.interval ? { interval: walking.interval } : {}) }, 'walking');
  } else {
    if (walkingId) requireCalculation(met(walkingId).category === 'walking', 'invalid-input', 'El código no corresponde a caminata.');
    if (walking.mode === 'duration' && walking.interval) validateInterval(walking.interval, 0);
  }
  const totalMinutes = nonnegative(blocks.reduce((sum, block) => sum + block.minutes, 0), 'Duración total');
  requireCalculation(totalMinutes <= 1440, 'invalid-duration', 'Los bloques y la caminata superan las 24 horas.');
  const ordered = [...intervals].sort((a, b) => a.startMinute - b.startMinute);
  for (let index = 1; index < ordered.length; index++) {
    requireCalculation(ordered[index].startMinute >= ordered[index - 1].endMinute, 'clock-overlap', 'Los intervalos horarios se superponen.');
  }
  const netActivityKcal = nonnegative(blocks.reduce((sum, block) => sum + block.netKcal, 0), 'Actividad neta');
  const expenditureKcal = positive((bmrKcal + netActivityKcal) / 0.90, 'Gasto diario estimado');
  return { mode: 'estimated', version: ENERGY_VERSION, restingFormula: HARRIS_BENEDICT_VERSION, bmrKcal, netActivityKcal,
    expenditureKcal, thermicFraction: THERMIC_FRACTION, totalMinutes, residualSteps, blocks,
    provisional: totalSteps.status !== 'actual' || work.status !== 'actual' || training.status !== 'actual' ||
      (walkingMinutes > 0 && (walkingSelected.status !== 'actual' || walking.mode === 'cadence')),
    selection: { totalSteps: totalSteps.status, work: work.status, training: training.status,
      walking: walkingSelected.status === 'missing' ? 'default' : walkingSelected.status },
    walking: { minutes: walkingMinutes, stepsPerMinute: cadence, activityId: walkingId, method: walking.mode },
    timing: { assumption: 'distinct-durations', checkedIntervals: intervals.length,
      coverage: !intervals.length ? 'none' : intervals.length === timedBlocks ? 'complete' : 'partial' } };
}
