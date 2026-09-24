import { newId, type UUID } from '../../core/domain/identity';
import { exerciseFixture } from '../exercises/exercise.fixtures';
import { catalogChoice, exerciseSnapshot } from '../exercises/exercise-catalog.model';
import type { RoutineContentDraft } from './routine.model';
import type { RoutineDraft } from './routines.repository';

export function routineFixture(): RoutineContentDraft {
  return { notes: 'Controlled progression', weeks: [{ id: newId(), name: 'Base', days: [{ id: newId(), name: 'Mixed day', exercises: [
    { id: newId(), exercise: exerciseSnapshot(catalogChoice(exerciseFixture())), notes: '', sets: [
      { id: newId(), type: 'weight-reps', reps: { minimum: 8, maximum: 12 }, weightKg: 0, targetRir: 2, restSeconds: 90, notes: '' },
    ] },
    { id: newId(), exercise: { exerciseId: 'cardio', name: 'Run', category: 'cardio', loggingType: 'distance_duration', instruction: '', media: null, catalogVersion: null }, notes: '', sets: [
      { id: newId(), type: 'distance-duration', meters: 1500, seconds: 600, restSeconds: 0, notes: '' },
    ] },
    { id: newId(), exercise: { exerciseId: 'stretch', name: 'Stretch', category: 'stretching', loggingType: 'duration', instruction: '', media: null, catalogVersion: null }, notes: '', sets: [
      { id: newId(), type: 'duration', seconds: 30, restSeconds: null, notes: '' },
    ] },
  ] }] }] };
}
export function routineDraft(personId: UUID, planId = newId(), baseRevisionId: UUID | null = null): RoutineDraft {
  const now = new Date().toISOString();
  return { id: newId(), personId, editorKey: `routine:${planId}`, createdAt: now, updatedAt: now,
    payload: { kind: 'routine', planId, baseRevisionId, name: 'Mixed plan', content: routineFixture() } };
}
