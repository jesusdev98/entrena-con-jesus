import { describe, expect, it } from 'vitest';
import { duplicateContent, duplicateDay, duplicateExercise, duplicateSet, duplicateWeek, editRows, newSet, routineErrors, savedContent, setErrors } from './routine-planning';
import type { LoggingType } from '../exercises/exercise.model';
import { routineFixture } from './routine.fixtures';

describe('routine draft and prescription boundaries', () => {
  it.each<LoggingType>(['weight-reps', 'weight_reps', 'bodyweight-reps', 'bodyweight_reps', 'assisted-reps', 'assisted_bodyweight', 'duration', 'distance-duration', 'distance_duration'])('requires targets for %s without adding actual effort', type => {
    const set = newSet(type);
    expect(setErrors(set).length).toBeGreaterThan(0); expect(set).not.toHaveProperty('rpe');
    if ('reps' in set) { set.reps = { minimum: 8, maximum: 12 }; set.targetRir = 0; }
    if ('seconds' in set) set.seconds = 30;
    if ('meters' in set) set.meters = 100.5;
    expect(setErrors(set)).toEqual([]);
  });
  it('rejects reversed, missing, fractional, infinite and negative targets while allowing optional zero load', () => {
    const set = newSet('weight_reps'); if (!('reps' in set)) throw new Error();
    for (const range of [{ minimum: 12, maximum: 8 }, { minimum: 0, maximum: 8 }, { minimum: 1.5, maximum: 8 }, { minimum: null, maximum: 8 }, { minimum: 8, maximum: Infinity }]) {
      set.reps = range; expect(setErrors(set).length).toBeGreaterThan(0);
    }
    set.reps = { minimum: 8, maximum: 8 }; set.targetRir = -1; expect(setErrors(set)).toContain('El RIR objetivo debe ser un número no negativo.');
    set.targetRir = 2.5; set.restSeconds = NaN; expect(setErrors(set).length).toBeGreaterThan(0);
    set.restSeconds = 0; expect(setErrors(set)).toEqual([]);
    const actualEffort = { ...set, rpe: 8 };
    expect(setErrors(actualEffort)).toContain('El esfuerzo real no pertenece a la planificación.');
  });
  it('validates nested structure, per-type sets and duplicate instance identities', () => {
    const value = routineFixture(); expect(routineErrors('Mixed', value)).toEqual([]);
    expect(routineErrors('', { notes: '', weeks: [] })).toHaveLength(2);
    const day = value.weeks[0].days[0]; day.exercises.push(day.exercises[0]);
    expect(routineErrors('Mixed', value).some(error => error.includes('identidad única'))).toBe(true);
    day.exercises[0].exercise.loggingType = 'duration';
    expect(routineErrors('Mixed', value).some(error => error.includes('tipo de ejercicio'))).toBe(true);
    day.exercises = []; expect(() => savedContent('Mixed', value)).toThrow('añade al menos un ejercicio');
  });
  it('deeply detaches saved values and every duplicate level while renewing only instance identities', () => {
    const content = routineFixture(); const original = structuredClone(content); const copy = duplicateContent(content);
    const week = content.weeks[0]; const day = week.days[0]; const exercise = day.exercises[0]; const set = exercise.sets[0];
    for (const [left, right] of [[week, duplicateWeek(week)], [day, duplicateDay(day)], [exercise, duplicateExercise(exercise)], [set, duplicateSet(set)]]) expect(left.id).not.toBe(right.id);
    const copiedExercise = copy.weeks[0].days[0].exercises[0]; expect(copiedExercise.exercise).toEqual(exercise.exercise);
    const saved = savedContent('Mixed', content); const media = copiedExercise.exercise.media;
    if (!media || !('frames' in media)) throw new Error();
    media.frames[0].attribution.creator = 'Changed'; copiedExercise.sets[0].notes = 'Changed';
    content.weeks[0].name = 'Changed';
    expect(saved).toEqual(original); expect(content.weeks[0].days[0]).toEqual(original.weeks[0].days[0]);
    expect(saved.weeks[0].id).toBe(week.id);
  });
  it('reorders without changing IDs or source values and handles boundary moves/removal', () => {
    const value = routineFixture().weeks[0].days[0].exercises; const original = structuredClone(value);
    const reordered = editRows(value, value[0].id, 'down', duplicateExercise);
    expect(reordered.map(row => row.id)).toEqual([value[1].id, value[0].id, value[2].id]); expect(value).toEqual(original);
    expect(editRows(value, value[0].id, 'up', duplicateExercise)).toBe(value);
    expect(editRows(value, value[0].id, 'remove', duplicateExercise)).toEqual(value.slice(1));
    expect(editRows(value, value[0].id, 'duplicate', duplicateExercise)).toHaveLength(4);
  });
});
