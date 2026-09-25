import type { LocalDate, UUID } from '../../core/domain/identity';
import type { DailyTargetSnapshot } from '../activity/daily-target.model';
import { intake } from '../nutrition/diary/diary.model';
import type { Nutrients } from '../nutrition/nutrition.model';
import type { ProgressData } from './progress-data.repository';
import { monday, shiftDate } from './training-history';

export interface Point { label: string; actual: number | null; target?: number | null; note?: string }
export interface DailyPoint { date: LocalDate; actual: Nutrients | null; target: Nutrients | null;
  steps: number | null; expenditure: number | null; source: 'manual' | 'estimated' | null }

/** No planned values, unfinished sessions, or foreign-owner records enter any series. */
export function progressSeries(data: ProgressData, owner: UUID, reference: LocalDate, exerciseId: string) {
  const start = shiftDate(monday(reference), -42);
  const weeks = Array.from({ length: 6 }, (_, index) => shiftDate(start, index * 7));
  const sessions = data.sessions.filter(session => session.personId === owner && session.status === 'completed');
  const completed = sessions.filter(session => session.date >= start && session.date < monday(reference));
  const weekly = weeks.map(date => {
    const matches = completed.filter(session => session.date >= date && session.date < shiftDate(date, 7));
    const weighted = matches.flatMap(session => session.exercises.flatMap(exercise => exercise.sets.flatMap(set =>
      set.status === 'completed' && set.actual.type === 'weight-reps'
        ? [{ id: exercise.exercise.exerciseId, kg: set.actual.weightKg, reps: set.actual.reps }] : [])));
    const selected = weighted.filter(set => set.id === exerciseId);
    return { label: date, sessions: matches.length, volume: weighted.reduce((sum, set) => sum + set.kg * set.reps, 0),
      load: selected.length ? Math.max(...selected.map(set => set.kg)) : null };
  });
  const logs = data.logs.filter(log => log.personId === owner && log.date <= reference);
  const snapshots = data.snapshots.filter((value): value is DailyTargetSnapshot => value.personId === owner && value.date <= reference && 'schemaVersion' in value && value.schemaVersion === 2);
  const last = [...logs.map(log => log.date), ...snapshots.map(day => day.date)].sort().at(-1);
  const end = last && last < shiftDate(reference, -13) ? last : reference;
  const dates = Array.from({ length: 14 }, (_, index) => shiftDate(end, index - 13));
  const days: DailyPoint[] = dates.map(date => {
    const entries = logs.filter(log => log.date === date);
    const saved = snapshots.find(snapshot => snapshot.date === date);
    return { date, actual: entries.length ? intake(entries) : null,
      target: saved ? { kcal: saved.calculation.result.targetKcal, ...saved.calculation.result.macroGrams } : null,
      steps: saved?.activity.totalSteps.actual ?? null,
      expenditure: saved?.calculation.result.expenditure.expenditureKcal ?? null,
      source: saved ? saved.activity.mode === 'manual-tdee' ? 'manual' : 'estimated' : null };
  });
  return { sessions: weekly.map(item => ({ label: item.label, actual: item.sessions })),
    volume: weekly.map(item => ({ label: item.label, actual: item.volume })),
    load: weekly.map(item => ({ label: item.label, actual: item.load })), days };
}

export function nutrientPoints(days: readonly DailyPoint[], key: keyof Nutrients): Point[] {
  return days.map(day => ({ label: day.date, actual: day.actual?.[key] ?? null, target: day.target?.[key] ?? null }));
}
