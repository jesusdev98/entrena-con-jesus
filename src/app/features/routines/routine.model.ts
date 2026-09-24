import type { Revision, UUID } from '../../core/domain/identity';
import type { ExerciseSnapshot } from '../exercises/exercise.model';
import type { PlanOrigin } from '../transfers/transfer.model';

export interface RepRange { minimum: number; maximum: number }
interface SetBase { id: UUID; restSeconds: number | null; notes: string }
export type SetPrescription = SetBase & (
  | { type: 'weight-reps'; reps: RepRange; weightKg: number | null; targetRir: number | null }
  | { type: 'bodyweight-reps'; reps: RepRange; targetRir: number | null }
  | { type: 'assisted-reps'; reps: RepRange; assistanceKg: number | null; targetRir: number | null }
  | { type: 'duration'; seconds: number }
  | { type: 'distance-duration'; meters: number; seconds: number | null }
);
export interface RoutineExercise { id: UUID; exercise: ExerciseSnapshot; sets: SetPrescription[]; notes: string }
export interface RoutineDay { id: UUID; name: string; exercises: RoutineExercise[] }
export interface RoutineWeek { id: UUID; name: string; days: RoutineDay[] }
export interface RoutineContent { weeks: RoutineWeek[]; notes: string }
export interface RoutineRevision extends Revision { readonly content: RoutineContent; readonly archived?: boolean; readonly exchange?: PlanOrigin }

/** Incomplete editor values never masquerade as a valid saved prescription. */
export type PlannedSetDraft = SetBase & (
  | { type: 'weight-reps'; reps: { minimum: number | null; maximum: number | null }; weightKg: number | null; targetRir: number | null }
  | { type: 'bodyweight-reps'; reps: { minimum: number | null; maximum: number | null }; targetRir: number | null }
  | { type: 'assisted-reps'; reps: { minimum: number | null; maximum: number | null }; assistanceKg: number | null; targetRir: number | null }
  | { type: 'duration'; seconds: number | null }
  | { type: 'distance-duration'; meters: number | null; seconds: number | null }
);
export interface RoutineExerciseDraft extends Omit<RoutineExercise, 'sets'> { sets: PlannedSetDraft[] }
export interface RoutineDayDraft extends Omit<RoutineDay, 'exercises'> { exercises: RoutineExerciseDraft[] }
export interface RoutineWeekDraft extends Omit<RoutineWeek, 'days'> { days: RoutineDayDraft[] }
export interface RoutineContentDraft extends Omit<RoutineContent, 'weeks'> { weeks: RoutineWeekDraft[] }
