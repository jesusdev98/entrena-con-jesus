import { describe, expect, it } from 'vitest';
import exercisesJson from '../../../../public/catalogs/exercises.es.json';
import foodsJson from '../../../../public/catalogs/foods.es.json';
import metsJson from '../../../../public/catalogs/activity-mets.json';
import { localDate, newId } from '../../core/domain/identity';
import { parseMetCatalog } from '../activity/met-catalog';
import { buildDemoData } from '../demo/demo-data';
import { parseExerciseCatalog } from '../exercises/exercise-catalog.model';
import { parseFoodCatalog } from '../nutrition/foods/food.model';
import { intake } from '../nutrition/diary/diary.model';
import { emptyProfile } from '../people/person.model';
import { nutrientPoints, progressSeries } from './progress-series';
import { monday, shiftDate } from './training-history';

const reference = localDate('2026-09-25');
const owner = newId();
const person = { id: owner, kind: 'client' as const, displayName: 'Demo', reference: '', archived: false,
  profile: { ...emptyProfile(), age: 32, formulaSex: 'male' as const, heightCm: 176, weightKg: 78 },
  createdAt: '2026-09-25T12:00:00Z', updatedAt: '2026-09-25T12:00:00Z' };
const demo = buildDemoData(person, { exercises: parseExerciseCatalog(exercisesJson), foods: parseFoodCatalog(foodsJson),
  mets: parseMetCatalog(metsJson) }, reference);
const data = { sessions: demo.sessions, logs: demo.foodLogs, snapshots: demo.snapshots };

describe('real progress series', () => {
  it('counts 21 actual sessions in six elapsed Monday weeks and preserves calendar year boundaries', () => {
    const series = progressSeries(data, owner, reference, 'exercise-bench-press');
    expect(series.sessions.map(point => point.actual)).toEqual([3, 4, 3, 4, 3, 4]);
    expect(series.sessions.reduce((sum, point) => sum + point.actual!, 0)).toBe(21);
    expect(progressSeries({ sessions: [], logs: [], snapshots: [] }, owner, localDate('2026-01-01'), '').sessions.map(point => point.label))
      .toEqual(['2025-11-17', '2025-11-24', '2025-12-01', '2025-12-08', '2025-12-15', '2025-12-22']);
    expect(monday(localDate('2026-01-01'))).toBe('2025-12-29');
  });
  it('sums only completed external weighted sets and shows progressive real bench maxima', () => {
    const series = progressSeries(data, owner, reference, 'exercise-bench-press');
    expect(series.load.map(point => point.actual)).toEqual([50, 50, 52.5, 52.5, 55, 55]);
    const modified = structuredClone(data);
    modified.sessions[0].exercises[0].sets.push({ ...modified.sessions[0].exercises[0].sets[0], id: newId(), status: 'skipped', actual: null, rpe: null });
    modified.sessions[0].exercises[0].sets.push({ ...modified.sessions[0].exercises[0].sets[0], id: newId(), status: 'completed',
      actual: { type: 'bodyweight-reps', reps: 100, rir: null }, rpe: 8, completedAt: modified.sessions[0].completedAt! });
    modified.sessions.push({ ...modified.sessions[0], id: newId(), status: 'draft' });
    expect(progressSeries(modified, owner, reference, 'exercise-bench-press').volume).toEqual(series.volume);
    expect(series.volume.every(point => point.actual! > 0)).toBe(true);
    expect(progressSeries(data, owner, reference, 'absent').load.every(point => point.actual === null)).toBe(true);
  });
  it('compares only logged food kcal and P/C/F to saved targets; preserves missing versus explicit zero', () => {
    const series = progressSeries(data, owner, reference, '');
    const latest = demo.snapshots.at(-1)!;
    const point = series.days.find(day => day.date === latest.date)!;
    expect(point.actual).toEqual(intake(demo.foodLogs.filter(log => log.date === latest.date)));
    expect(point.target).toEqual({ kcal: latest.calculation.result.targetKcal, ...latest.calculation.result.macroGrams });
    expect(nutrientPoints(series.days, 'protein').find(row => row.label === latest.date)).toEqual({
      label: latest.date, actual: point.actual!.protein, target: point.target!.protein });
    expect(nutrientPoints(series.days, 'carbohydrate').find(row => row.label === latest.date)?.actual).toBe(point.actual!.carbohydrate);
    expect(nutrientPoints(series.days, 'fat').find(row => row.label === latest.date)?.target).toBe(point.target!.fat);
    const gap = series.days.find(day => day.date === shiftDate(latest.date, -1))!;
    expect(gap.actual).toBeNull(); expect(gap.target).toBeNull();
    const noTarget = progressSeries({ ...data, snapshots: [] }, owner, reference, '').days.find(day => day.date === latest.date)!;
    expect(noTarget.actual).not.toBeNull(); expect(noTarget.target).toBeNull();
    const zero = structuredClone(data), last = zero.snapshots.length - 1;
    zero.snapshots[last] = { ...zero.snapshots[last], calculation: { ...zero.snapshots[last].calculation,
      result: { ...zero.snapshots[last].calculation.result,
        macroGrams: { ...zero.snapshots[last].calculation.result.macroGrams, fat: 0 } } } };
    expect(progressSeries(zero, owner, reference, '').days.find(day => day.date === latest.date)?.target?.fat).toBe(0);
  });
  it('uses saved actual steps and labeled manual or estimated expenditure, not forecast steps', () => {
    const saved = demo.snapshots.at(-1)!;
    const estimated = progressSeries(data, owner, reference, '').days.find(day => day.date === saved.date)!;
    expect(estimated.steps).toBe(saved.activity.totalSteps.actual);
    expect(estimated.expenditure).toBe(saved.calculation.result.expenditure.expenditureKcal);
    expect(estimated.source).toBe('estimated');
    const manualPerson = { ...person, profile: emptyProfile() };
    const manual = buildDemoData(manualPerson, { exercises: parseExerciseCatalog(exercisesJson), foods: parseFoodCatalog(foodsJson),
      mets: parseMetCatalog(metsJson) }, reference);
    const actual = progressSeries({ sessions: manual.sessions, logs: manual.foodLogs, snapshots: manual.snapshots }, owner, reference, '').days
      .find(day => day.date === manual.snapshots.at(-1)!.date)!;
    expect(actual.source).toBe('manual'); expect(actual.expenditure).toBe(2100); expect(actual.steps).toBe(manual.snapshots.at(-1)!.activity.totalSteps.actual);
    const forecastOnly = structuredClone(data); delete forecastOnly.snapshots.at(-1)!.activity.totalSteps.actual;
    expect(progressSeries(forecastOnly, owner, reference, '').days.find(day => day.date === saved.date)?.steps).toBeNull();
  });
  it('isolates owners and leaves all unrecorded dates empty', () => {
    const foreign = progressSeries(data, newId(), reference, 'exercise-bench-press');
    expect(foreign.sessions.every(point => point.actual === 0)).toBe(true);
    expect(foreign.volume.every(point => point.actual === 0)).toBe(true);
    expect(foreign.load.every(point => point.actual === null)).toBe(true);
    expect(foreign.days.every(day => day.actual === null && day.target === null && day.steps === null && day.expenditure === null)).toBe(true);
  });
});
