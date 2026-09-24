import type { EnergyProfile } from '../nutrition/calculations/harris-benedict';

/** Null/undefined are missing. Explicit 0 and empty blocks are intentional actuals. */
export interface ForecastActual<T> { forecast?: T | null; actual?: T | null }
export interface DayInterval { startMinute: number; endMinute: number }
export type BlockExpenditure = { mode: 'met'; activityId: string } |
  { mode: 'manual-net'; netKcal: number; reason: string };
export interface EnergyBlock {
  id: string;
  minutes: number;
  expenditure: BlockExpenditure;
  linkedTrainingSessionId?: string | null;
  interval?: DayInterval;
}
export interface ActivityGroup { blocks: EnergyBlock[]; includedSteps: number }
export type WalkingInput = {
  mode: 'cadence'; stepsPerMinute?: number; activityId?: string;
} | {
  /** The selected walking code represents the reported pace/terrain; no interpolation. */
  mode: 'duration'; minutes: number; activityId: string; interval?: DayInterval;
};
export interface EstimatedEnergyInput {
  mode: 'estimated';
  profile: EnergyProfile;
  totalSteps: ForecastActual<number>;
  work: ForecastActual<ActivityGroup>;
  training: ForecastActual<ActivityGroup>;
  walking?: ForecastActual<WalkingInput>;
}
/** A full daily expenditure already includes any thermic effect. */
export interface ManualEnergyInput { mode: 'manual-tdee'; expenditureKcal: number; reason: string }
export type EnergyInput = EstimatedEnergyInput | ManualEnergyInput;
