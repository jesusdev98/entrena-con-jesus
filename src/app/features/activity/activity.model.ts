import type { LocalDate, OwnedRecord, UUID } from '../../core/domain/identity';
import type { MacroPercentages, PersonProfile } from '../people/person.model';
import type { DailyTargetSnapshot } from './daily-target.model';

export type MetReference = { code: string; met: number; version: string } & (
  | { table: 'adult'; referenceOxygenMlKgMin: 3.5 }
  | { table: 'older-adult'; referenceOxygenMlKgMin: 2.7 }
);
export interface ActivityBlock {
  id: UUID;
  kind: 'work' | 'training';
  minutes: number;
  activity: MetReference;
  includedSteps: number;
  sessionId: UUID | null;
}
export type DailyValue<T> = { status: 'missing' } | { status: 'forecast' | 'actual'; value: T };
export interface DailyActivityInput {
  totalSteps: DailyValue<number>;
  work: DailyValue<ActivityBlock[]>;
  training: DailyValue<ActivityBlock[]>;
  walking: { mode: 'cadence'; stepsPerMinute: number; activity: MetReference }
    | { mode: 'duration'; minutes: number; activity: MetReference };
}
export type DailySnapshot = LegacyDailySnapshot | DailyTargetSnapshot;
export interface LegacyDailySnapshot extends OwnedRecord {
  date: LocalDate;
  profileRevisionId: UUID;
  profile: PersonProfile;
  activity: DailyActivityInput;
  calculation: { mode: 'estimated'; version: 'revised-hb-1984-net-met-v1'; bmr: number; thermicFraction: 0.1 }
    | { mode: 'manual'; expenditureKcal: number; reason: string };
  expenditureKcal: number;
  signedAdjustmentKcal: number;
  targetKcal: number;
  macroPercentages: MacroPercentages;
  macroGrams: MacroPercentages;
  provisional: boolean;
}
