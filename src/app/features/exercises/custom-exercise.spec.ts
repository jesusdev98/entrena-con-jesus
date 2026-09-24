import { describe, expect, it } from 'vitest';
import { newId } from '../../core/domain/identity';
import { catalogChoice, customChoice, exerciseSnapshot, filterExercises, validateCustomExercise } from './exercise-catalog.model';
import type { CustomExercise, ExerciseSnapshot } from './exercise.model';
import { exerciseFixture } from './exercise.fixtures';

const input = { name: '  Remo propio  ', category: 'strength', loggingType: 'weight_reps', instruction: '', notes: '', equipment: ' Banda, Banco, Banda ' };
describe('custom exercise validation and search', () => {
  it.each(['weight_reps', 'bodyweight_reps', 'assisted_bodyweight', 'duration', 'distance_duration'])('accepts %s and normalizes optional text/equipment', loggingType => {
    expect(validateCustomExercise({ ...input, loggingType })).toEqual({ name: 'Remo propio', category: 'strength', loggingType, instruction: '', notes: '', equipment: ['Banda', 'Banco'] });
    expect(validateCustomExercise({ name: 'Caminar', category: 'cardio', loggingType: 'duration' }).equipment).toEqual([]);
  });
  it('rejects missing/invalid required fields and oversized optional text', () => {
    for (const change of [{ name: '  ' }, { name: 'x'.repeat(161) }, { category: '' }, { category: 'unknown' }, { loggingType: '' }, { loggingType: 'reps' },
      { instruction: 'x'.repeat(1001) }, { notes: 'x'.repeat(1001) }, { equipment: 'x'.repeat(501) }, { equipment: ['Banda'] }]) {
      expect(() => validateCustomExercise({ ...input, ...change })).toThrow();
    }
  });
  it('reads old logging identifiers without rewriting catalog data', () => {
    expect(validateCustomExercise({ ...input, loggingType: 'assisted-reps' }).loggingType).toBe('assisted_bodyweight');
    expect(exerciseSnapshot(catalogChoice(exerciseFixture())).loggingType).toBe('weight-reps');
  });
  it('finds custom names and equipment without inventing muscle metadata', () => {
    const exercise = customChoice(customExercise());
    const filters = { query: 'remo PROPIO', category: 'strength', muscle: '', equipment: 'Banda' };
    expect(filterExercises([exercise], filters)).toEqual([exercise]);
    expect(filterExercises([exercise], { ...filters, muscle: 'Espalda' })).toEqual([]);
  });
});

export function customExercise(): CustomExercise {
  return { ...validateCustomExercise(input), id: newId(), personId: newId(), createdAt: '2026-09-16T00:00:00.000Z', updatedAt: '2026-09-16T00:00:00.000Z' };
}

describe('detached exercise snapshots', () => {
  it.each(['movement', 'cycle', 'hold'] as const)('retains ordered frame-specific metadata for %s and detaches every nested object', mode => {
    const entry = exerciseFixture();
    entry.media.mode = mode;
    entry.media.semantics = mode === 'movement' ? 'position-pair' : mode === 'cycle' ? 'partial-sequence' : 'static-references';
    const original = structuredClone(entry);
    const snapshot = exerciseSnapshot(catalogChoice(entry));
    expect(snapshot.media).toEqual(original.media);
    expect(snapshot.source).toEqual(original.source);
    expect(snapshot.catalogVersion).toBe(`1/${entry.source.revision}`);
    if (!snapshot.media || !('frames' in snapshot.media)) throw new Error('Missing reviewed media');
    expect(snapshot.media.frames.map(frame => frame.frame)).toEqual([3, 1]);
    expect(snapshot.media.frames[0].attribution.source).toBeUndefined();
    expect(snapshot.media.frames[1].attribution.source?.changes).toBe('Tracing of this frame only.');
    snapshot.media.frames[0].attribution.collectionCredit.scope = 'Changed snapshot';
    snapshot.media.frames[1].attribution.source!.changes = 'Changed snapshot';
    snapshot.media.review.note = 'Changed snapshot';
    snapshot.source!.attribution.creator = 'Changed snapshot';
    snapshot.equipment!.push('Changed snapshot'); snapshot.muscles!.push('Changed snapshot');
    expect(entry).toEqual(original);
    entry.media.frames[0].label = 'Changed source';
    expect(snapshot.media.frames[0].label).toBe(original.media.frames[0].label);
  });
  it('never includes custom media and preserves detached notes/equipment after editing or archiving', () => {
    const custom = customExercise(); custom.notes = 'Conservar';
    const snapshot = exerciseSnapshot(customChoice(custom));
    custom.name = 'Edited'; custom.notes = 'Edited'; custom.equipment!.push('Edited'); custom.archived = true;
    expect(snapshot).toMatchObject({ name: 'Remo propio', notes: 'Conservar', equipment: ['Banda', 'Banco'], media: null, catalogVersion: null });
    expect(snapshot.source).toBeUndefined();
    expect(snapshot).not.toHaveProperty('personId');
  });
  it('retains the old single-credit snapshot contract without flattening reviewed frames into it', () => {
    const legacy: ExerciseSnapshot = { exerciseId: 'old', name: 'Old', category: 'strength', loggingType: 'weight-reps', instruction: '', catalogVersion: null,
      media: { startAssetId: 'start', finishAssetId: 'finish', credit: { author: 'Original author', sourceUrl: 'https://example.org', license: 'Old license', licenseUrl: 'https://example.org/license', changes: 'Original changes' } } };
    const preserved = structuredClone(legacy);
    exerciseSnapshot(catalogChoice(exerciseFixture()));
    expect(legacy).toEqual(preserved);
    expect(legacy.media).toHaveProperty('credit.author', 'Original author');
  });
});
