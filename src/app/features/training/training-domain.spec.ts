import { describe, expect, it } from 'vitest';
import { localDate } from '../../core/domain/identity';
import { actualErrors, blankPerformance, completeSet, frozenSession, reopenSet, sessionErrors, skipSet, startSession } from './training-domain';
import type { PerformanceDraft } from './training.model';
import { performed, revisionFixture, sessionFixture } from './training.fixtures';

describe('actual performance independent from prescriptions', () => {
  it.each<PerformanceDraft>([
    { type: 'weight-reps', weightKg: 0, reps: 1, rir: 0 }, { type: 'weight-reps', weightKg: 2.75, reps: 9, rir: null },
    { type: 'bodyweight-reps', reps: 8, rir: 1.5 }, { type: 'assisted-reps', assistanceKg: 12.5, reps: 7, rir: null },
    { type: 'duration', seconds: 0.5 }, { type: 'distance-duration', meters: 800.5, seconds: 300 },
  ])('accepts independently entered $type values with half-point effort', value => {
    expect(actualErrors(value, 7.5, value.type)).toEqual([]);
    expect(actualErrors(value, 1, value.type)).toEqual([]); expect(actualErrors(value, 10, value.type)).toEqual([]);
  });
  it('rejects missing/nonfinite/negative values, fractional repetitions and mismatched actual types', () => {
    const valid: PerformanceDraft = { type: 'weight-reps', weightKg: 0, reps: 8, rir: null };
    for (const rpe of [null, 0, 10.5, 7.25, Infinity, NaN]) expect(actualErrors(valid, rpe, valid.type).length).toBeGreaterThan(0);
    for (const reps of [null, 0, -1, 1.5, Infinity, NaN]) expect(actualErrors({ ...valid, reps }, 8, valid.type).length).toBeGreaterThan(0);
    for (const weightKg of [null, -1, Infinity, NaN]) expect(actualErrors({ ...valid, weightKg }, 8, valid.type).length).toBeGreaterThan(0);
    for (const rir of [-1, NaN, Infinity]) expect(actualErrors({ ...valid, rir }, 8, valid.type).length).toBeGreaterThan(0);
    expect(actualErrors(valid, 8, 'assisted-reps')).not.toEqual([]);
  });
  it('requires actual duration and distance independently, and rejects non-repetition RIR', () => {
    for (const seconds of [null, 0, -1, NaN, Infinity]) expect(actualErrors({ type: 'duration', seconds }, 5, 'duration')).not.toEqual([]);
    for (const meters of [null, 0, -1, NaN, Infinity]) expect(actualErrors({ type: 'distance-duration', meters, seconds: 20 }, 5, 'distance-duration')).not.toEqual([]);
    const invalid = { type: 'duration' as const, seconds: 30, rir: 2 };
    expect(actualErrors(invalid, 5, 'duration')).toContain('Hay campos que no corresponden a este tipo de registro.');
    expect(actualErrors({ type: 'assisted-reps', assistanceKg: null, reps: 8, rir: null }, 8, 'assisted-reps')).not.toEqual([]);
  });
  it('starts blank from both logging conventions and deeply detaches the full prescription/media', () => {
    const revision = revisionFixture(); const before = structuredClone(revision); const week = revision.content.weeks[0];
    const session = startSession(revision, week.id, week.days[0].id, localDate('2026-01-01'));
    expect(session.source?.revisionId).toBe(revision.id); expect(session.labels.day).toBe('Mixed day');
    expect(session.exercises[0].sets[0].actual).toEqual({ type: 'weight-reps', weightKg: null, reps: null, rir: null });
    expect(session.exercises[1].sets[0].actual).toEqual({ type: 'distance-duration', meters: null, seconds: null });
    expect(session.exercises.flatMap(e => e.sets).every(s => s.rpe === null && s.status === 'draft')).toBe(true);
    revision.content.weeks[0].days[0].exercises[0].exercise.name = 'Changed';
    const media = revision.content.weeks[0].days[0].exercises[0].exercise.media;
    if (media && 'frames' in media) media.frames[0].attribution.creator = 'Changed credit';
    revision.content.weeks[0].days[0].exercises[0].sets[0].notes = 'Changed target';
    expect(session.exercises[0].exercise).toEqual(before.content.weeks[0].days[0].exercises[0].exercise);
    expect(session.exercises[0].sets[0].prescribed).toEqual(before.content.weeks[0].days[0].exercises[0].sets[0]);
  });
  it('rejects missing actual properties rather than accepting a structurally incomplete completed record', () => {
    for (const type of ['weight-reps', 'bodyweight-reps', 'assisted-reps', 'duration', 'distance-duration'] as const) {
      expect(actualErrors({ type } as PerformanceDraft, 8, type)).toContain('Faltan campos del registro real. Completa los valores antes de confirmar.');
    }
  });
  it('does not finish undecided sets; explicit skipping never fabricates zero performance', () => {
    const session = performed(sessionFixture()); session.exercises[1].sets[0] = reopenSet(session.exercises[1].sets[0], 'distance-duration');
    expect(sessionErrors(session).join()).toContain('no realizada');
    session.exercises[1].sets[0] = skipSet(session.exercises[1].sets[0]); expect(sessionErrors(session)).toEqual([]);
    expect(session.exercises[1].sets[0]).toMatchObject({ status: 'skipped', actual: null, rpe: null });
    expect(() => completeSet(session.exercises[1].sets[0], 'distance-duration')).toThrow('editar');
    expect(reopenSet(session.exercises[1].sets[0], 'distance-duration').actual).toEqual(blankPerformance('distance-duration'));
  });
  it('validates completed fields at commit and rejects impossible local dates/durations', () => {
    const session = performed(sessionFixture()); expect(sessionErrors(session)).toEqual([]);
    for (const duration of [0, -1, Infinity, 1441]) expect(sessionErrors({ ...session, durationMinutes: duration })).not.toEqual([]);
    expect(sessionErrors({ ...session, durationMinutes: null })).toEqual([]);
    const set = session.exercises[0].sets[0]; if (set.status === 'completed') set.rpe = 10.5;
    expect(sessionErrors(session).join()).toContain('RPE');
    expect(() => startSession(revisionFixture(), session.id, session.id, localDate('2026-01-01'))).toThrow('disponibles');
    expect(() => localDate('2026-02-29')).toThrow();
  });
  it('freezes prescription identity while allowing actual corrections without rewriting targets', () => {
    const original = sessionFixture(); const completed = performed(original);
    expect(frozenSession(completed)).toEqual(frozenSession(original));
    expect(completed.exercises[0].sets[0].prescribed).toMatchObject({ weightKg: 0, reps: { minimum: 8, maximum: 12 }, targetRir: 2 });
    expect(completed.exercises[0].sets[0].actual).toEqual({ type: 'weight-reps', weightKg: 12.5, reps: 9, rir: 1.5 });
    const reopened = reopenSet(completed.exercises[0].sets[0], 'weight-reps'); expect(reopened.status).toBe('draft'); expect(reopened.actual).toEqual(completed.exercises[0].sets[0].actual);
  });
});
