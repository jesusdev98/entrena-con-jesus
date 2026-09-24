import { localDate, type LocalDate, type UUID } from '../../core/domain/identity';
import type { TrainingSession } from '../training/training.model';

export function today(now = new Date()): LocalDate { return localDate(`${now.getFullYear().toString().padStart(4, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`); }
/** Calendar arithmetic in UTC avoids converting the user's local date into a timestamp. */
export function shiftDate(date: LocalDate, days: number): LocalDate {
  const value = new Date(`${localDate(date)}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return localDate(value.toISOString().slice(0, 10));
}
export function monday(date: LocalDate): LocalDate { const day = new Date(`${localDate(date)}T12:00:00Z`).getUTCDay(); return shiftDate(date, -((day + 6) % 7)); }
export function weekSessions(sessions: TrainingSession[], personId: UUID, date: LocalDate, exerciseId = '', exactDate: LocalDate | '' = ''): TrainingSession[] {
  const start = monday(date); const end = shiftDate(start, 7);
  return sessions.filter(session => session.personId === personId && session.status === 'completed' && session.date >= start && session.date < end
    && (!exactDate || session.date === exactDate)
    && (!exerciseId || session.exercises.some(exercise => exercise.exercise.exerciseId === exerciseId)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id));
}
export function completedCount(sessions: TrainingSession[], exerciseId = ''): number {
  return sessions.reduce((total, session) => total + session.exercises.filter(exercise => !exerciseId || exercise.exercise.exerciseId === exerciseId)
    .reduce((n, exercise) => n + exercise.sets.filter(set => set.status === 'completed').length, 0), 0);
}
