import type { Instant, LocalDate, OwnedRecord, UUID } from '../../core/domain/identity';
import type { ExerciseSnapshot } from '../exercises/exercise.model';
import type { SetPrescription } from '../routines/routine.model';
import type { ProgressOrigin } from '../transfers/transfer.model';

export type Performance =
  | { type: 'weight-reps'; weightKg: number; reps: number; rir: number | null }
  | { type: 'bodyweight-reps'; reps: number; rir: number | null }
  | { type: 'assisted-reps'; assistanceKg: number; reps: number; rir: number | null }
  | { type: 'duration'; seconds: number }
  | { type: 'distance-duration'; meters: number; seconds: number };
type NullablePerformance<T> = T extends Performance ? { [K in keyof T]: K extends 'type' ? T[K] : T[K] | null } : never;
export type PerformanceDraft = NullablePerformance<Performance>;
export type ActualSet = { id: UUID; prescribed: SetPrescription | null } & (
  | { status: 'draft'; actual: PerformanceDraft; rpe: number | null }
  | { status: 'completed'; actual: Performance; rpe: number; completedAt: Instant }
  | { status: 'skipped'; actual: null; rpe: null }
);
export interface SessionExercise { id: UUID; exercise: ExerciseSnapshot; sets: ActualSet[]; notes: string }
export interface TrainingSession extends OwnedRecord {
  exchange?: ProgressOrigin;
  date: LocalDate;
  status: 'draft' | 'completed';
  source: { planId: UUID; revisionId: UUID; weekId: UUID; dayId: UUID } | null;
  labels: { routine: string; week: string; day: string; routineNotes: string };
  version: number;
  startedAt: Instant;
  completedAt: Instant | null;
  exercises: SessionExercise[];
  /** Materialized personId:exerciseId keys for the multiEntry history index. */
  personExerciseKeys: string[];
  durationMinutes: number | null;
  durationSource: 'manual' | null;
  notes: string;
}
