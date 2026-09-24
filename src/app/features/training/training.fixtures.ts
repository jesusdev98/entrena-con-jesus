import { localDate, newId, type UUID } from '../../core/domain/identity';
import { routineFixture } from '../routines/routine.fixtures';
import { savedContent } from '../routines/routine-planning';
import type { RoutineRevision } from '../routines/routine.model';
import { completeSet, startSession } from './training-domain';
import type { PerformanceDraft, TrainingSession } from './training.model';

export function revisionFixture(owner = newId()): RoutineRevision {
  return { id: newId(), personId: owner, planId: newId(), parentRevisionId: null, name: 'Mixed plan', createdAt: '2026-01-01T12:00:00Z', updatedAt: '2026-01-01T12:00:00Z', content: savedContent('Mixed plan', routineFixture()) };
}
export function sessionFixture(owner?: UUID): TrainingSession {
  const revision = revisionFixture(owner); const week = revision.content.weeks[0];
  return startSession(revision, week.id, week.days[0].id, localDate('2026-01-01'), '2026-01-01T12:00:00Z');
}
export function performed(session: TrainingSession): TrainingSession {
  const values: PerformanceDraft[] = [{ type: 'weight-reps', weightKg: 12.5, reps: 9, rir: 1.5 }, { type: 'distance-duration', meters: 1250, seconds: 510 }, { type: 'duration', seconds: 25 }];
  return { ...structuredClone(session), durationMinutes: 40, exercises: session.exercises.map((exercise, index) => ({ ...structuredClone(exercise), sets: exercise.sets.map(set => completeSet({ ...set, status: 'draft', actual: values[index], rpe: 7.5 }, values[index].type, '2026-01-01T12:40:00Z')) })) };
}
