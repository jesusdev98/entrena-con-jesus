import { localDate, newId, type LocalDate, type OwnedRecord, type UUID } from '../../core/domain/identity';
import type { PersonProfile, ProfileRevision } from '../people/person.model';
import type { ActivityGroup, EnergyBlock, ForecastActual, WalkingInput } from './energy-input';
import type { MetCatalog } from './met-catalog';
import { calculateDailyTargets } from '../nutrition/calculations/daily-calculation';
import { ENERGY_VERSION } from '../nutrition/calculations/daily-expenditure';
import { requireCalculation } from '../nutrition/calculations/calculation-error';
import type { TrainingSession } from '../training/training.model';

export type BlockDraft = Omit<EnergyBlock, 'minutes' | 'expenditure'> & {
  minutes: number | null;
  expenditure: { mode: 'met'; activityId: string } | { mode: 'manual-net'; netKcal: number | null; reason: string };
};
export interface GroupDraft { includedSteps: number | null; blocks: BlockDraft[] }
export interface ActivityDayValue {
  mode: 'estimated' | 'manual-tdee'; manualKcal: number | null; manualReason: string;
  totalSteps: ForecastActual<number>; work: ForecastActual<GroupDraft>; training: ForecastActual<GroupDraft>;
  walking: ForecastActual<WalkingInput>;
  goal: PersonProfile['goal']; adjustmentKcal: number | null;
  macros: { protein: number | null; carbohydrate: number | null; fat: number | null };
}
export interface CalculationContext {
  profileRevisionId: UUID; profile: PersonProfile; catalog: MetCatalog; engineVersion: typeof ENERGY_VERSION;
}
export type DailyCalculation = ReturnType<typeof calculateDailyTargets>;
export interface DailyTargetSnapshot extends OwnedRecord {
  schemaVersion: 2; version: number; date: LocalDate; context: CalculationContext;
  activity: ActivityDayValue; calculation: DailyCalculation;
}
export interface ActivityDraftPayload {
  kind: 'daily-target'; date: LocalDate; context: CalculationContext; value: ActivityDayValue;
  base: DailyTargetSnapshot | null;
}
export function today(): LocalDate {
  const now = new Date();
  return localDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
}
export function initialActivity(profile: PersonProfile): ActivityDayValue {
  const usual = profile.usualActivity;
  const group = (minutes: number | null, code: string | null, includedSteps: number | null): GroupDraft | null => {
    if (minutes === null) return null;
    return { includedSteps, blocks: minutes === 0 ? [] : [{ id: newId(), minutes,
      expenditure: { mode: 'met', activityId: code ? (code.includes(':') ? code : `${profile.age !== null && profile.age >= 60 ? 'older-adult' : 'adult'}:${code}`) : '' } }] };
  };
  return { mode: 'estimated', manualKcal: null, manualReason: '', totalSteps: { forecast: usual.totalSteps },
    work: { forecast: group(usual.workMinutes, usual.workActivityCode, usual.workSteps) },
    training: { forecast: group(usual.trainingMinutes, usual.trainingActivityCode, usual.trainingSteps) },
    walking: { forecast: { mode: 'cadence', stepsPerMinute: usual.walkingCadence } },
    goal: profile.goal, adjustmentKcal: profile.adjustmentKcal, macros: structuredClone(profile.macros) };
}
function required(value: number | null | undefined, label: string): number {
  requireCalculation(value != null, 'invalid-input', `Completa ${label}; cero debe introducirse explícitamente.`);
  return value;
}
export function calculateActivity(value: ActivityDayValue, context: CalculationContext): DailyCalculation {
  requireCalculation(context.engineVersion === ENERGY_VERSION, 'invalid-input', 'Esta versión de cálculo requiere una actualización explícita del contexto.');
  const group = (input: ForecastActual<GroupDraft>): ForecastActual<ActivityGroup> => {
    // Only the selected group must be complete. Replaced forecasts stay intact in activity.
    const selected = input.actual != null ? 'actual' : 'forecast'; const data = input[selected];
    if (data == null) return {};
    return { [selected]: { includedSteps: required(data.includedSteps, 'los pasos incluidos'), blocks: data.blocks.map(block => ({ ...block,
      minutes: required(block.minutes, 'la duración del bloque'), expenditure: block.expenditure.mode === 'met' ? block.expenditure : {
        ...block.expenditure, netKcal: required(block.expenditure.netKcal, 'el gasto neto') } })) } };
  };
  const amount = required(value.adjustmentKcal, 'el ajuste');
  requireCalculation(Number.isFinite(amount) && amount >= 0, 'invalid-input', 'El ajuste debe ser un número no negativo.');
  return calculateDailyTargets({ energy: value.mode === 'manual-tdee'
    ? { mode: 'manual-tdee', expenditureKcal: required(value.manualKcal, 'el gasto diario manual'), reason: value.manualReason }
    : { mode: 'estimated', profile: context.profile, totalSteps: value.totalSteps, work: group(value.work), training: group(value.training), walking: value.walking },
    signedAdjustmentKcal: value.goal === 'maintenance' ? 0 : value.goal === 'loss' ? -amount : amount,
    macroPercentages: { protein: required(value.macros.protein, 'proteínas'), carbohydrate: required(value.macros.carbohydrate, 'carbohidratos'), fat: required(value.macros.fat, 'grasas') },
  }, context.catalog);
}
export function capturedContext(revision: ProfileRevision, catalog: MetCatalog): CalculationContext {
  return structuredClone({ profileRevisionId: revision.id, profile: revision.profile, catalog, engineVersion: ENERGY_VERSION });
}
/** Carry forward profile defaults only where the day has not overridden them. Actuals never change. */
export function updatedProfileDefaults(value: ActivityDayValue, previous: PersonProfile, profile: PersonProfile): ActivityDayValue {
  const next = structuredClone(value), before = initialActivity(previous), after = initialActivity(profile);
  const equal = (a: unknown, b: unknown) => JSON.stringify(a, (key, item: unknown) => key === 'id' ? undefined : item) === JSON.stringify(b, (key, item: unknown) => key === 'id' ? undefined : item);
  if (value.goal === previous.goal && value.adjustmentKcal === previous.adjustmentKcal) { next.goal = profile.goal; next.adjustmentKcal = profile.adjustmentKcal; }
  if (equal(value.macros, previous.macros)) next.macros = structuredClone(profile.macros);
  for (const key of ['totalSteps', 'work', 'training', 'walking'] as const) {
    if (equal(value[key].forecast, before[key].forecast)) {
      if (key === 'work' || key === 'training') {
        const forecast = structuredClone(after[key].forecast);
        if (forecast && value[key].forecast) forecast.blocks.forEach((block, index) => {
          if (value[key].forecast!.blocks[index]) block.id = value[key].forecast!.blocks[index].id;
        });
        Object.assign(next[key], { forecast });
      } else {
        Object.assign(next[key], { forecast: structuredClone(after[key].forecast) });
      }
    }
  }
  return next;
}
export function linkedBlock(session: TrainingSession, owner: UUID, date: LocalDate, existing: BlockDraft[]): BlockDraft {
  requireCalculation(session.personId === owner && session.date === date && session.status === 'completed', 'invalid-input', 'Elige una sesión finalizada de esta persona y fecha.');
  requireCalculation(!existing.some(block => block.linkedTrainingSessionId === session.id), 'duplicate-activity', 'Esta sesión ya está incluida.');
  return { id: newId(), linkedTrainingSessionId: session.id, minutes: session.durationSource === 'manual' ? session.durationMinutes : null, expenditure: { mode: 'met', activityId: '' } };
}
