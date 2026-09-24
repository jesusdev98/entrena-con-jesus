import { localDate, newId, type LocalDate, type UUID } from '../../core/domain/identity';
import { prescriptionType } from '../routines/routine-planning';
import type { RoutineRevision, SetPrescription } from '../routines/routine.model';
import type { ActualSet, Performance, PerformanceDraft, TrainingSession } from './training.model';

export function blankPerformance(type: Performance['type']): PerformanceDraft {
  switch (type) {
    case 'weight-reps': return { type, weightKg: null, reps: null, rir: null };
    case 'bodyweight-reps': return { type, reps: null, rir: null };
    case 'assisted-reps': return { type, assistanceKg: null, reps: null, rir: null };
    case 'duration': return { type, seconds: null };
    case 'distance-duration': return { type, meters: null, seconds: null };
  }
}
const nonnegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const positive = (n: unknown): n is number => nonnegative(n) && n > 0;
export function actualErrors(actual: PerformanceDraft, rpe: number | null, expected: Performance['type']): string[] {
  const errors: string[] = [];
  if (actual.type !== expected) errors.push('El tipo real no coincide con el ejercicio guardado.');
  if (!positive(rpe) || rpe < 1 || rpe > 10 || !Number.isInteger(rpe * 2)) errors.push('Indica el esfuerzo real RPE de 1 a 10, en pasos de 0,5.');
  const fields: Record<Performance['type'], string[]> = {
    'weight-reps': ['weightKg', 'reps', 'rir'], 'bodyweight-reps': ['reps', 'rir'],
    'assisted-reps': ['assistanceKg', 'reps', 'rir'], duration: ['seconds'], 'distance-duration': ['meters', 'seconds'],
  };
  if (fields[expected].some(key => !(key in actual))) errors.push('Faltan campos del registro real. Completa los valores antes de confirmar.');
  if (Object.keys(actual).some(key => key !== 'type' && !fields[expected].includes(key))) errors.push('Hay campos que no corresponden a este tipo de registro.');
  if ('reps' in actual) {
    if (!positive(actual.reps) || !Number.isInteger(actual.reps)) errors.push('Indica repeticiones reales enteras mayores que cero.');
    if (actual.rir !== null && !nonnegative(actual.rir)) errors.push('El RIR real debe ser no negativo o quedar vacío.');
  }
  if (actual.type === 'weight-reps' && !nonnegative(actual.weightKg)) errors.push('Indica el peso externo real en kg (cero es válido).');
  if (actual.type === 'assisted-reps' && !nonnegative(actual.assistanceKg)) errors.push('Indica la asistencia real en kg (cero es válido).');
  if ('seconds' in actual && !positive(actual.seconds)) errors.push('Indica la duración real en segundos, mayor que cero.');
  if ('meters' in actual && !positive(actual.meters)) errors.push('Indica la distancia real en metros, mayor que cero.');
  return errors;
}
export function completeSet(set: ActualSet, expected: Performance['type'], now = new Date().toISOString()): ActualSet {
  if (set.status === 'skipped') throw new Error('Vuelve a editar la serie antes de completarla.');
  const errors = actualErrors(set.actual, set.rpe, expected);
  if (errors.length) throw new Error(errors.join(' '));
  return { ...set, status: 'completed', actual: structuredClone(set.actual) as Performance, rpe: set.rpe!, completedAt: now };
}
export function reopenSet(set: ActualSet, type: Performance['type']): ActualSet {
  return { id: set.id, prescribed: set.prescribed, status: 'draft', actual: set.actual ? structuredClone(set.actual) : blankPerformance(type), rpe: set.rpe };
}
export function skipSet(set: ActualSet): ActualSet { return { id: set.id, prescribed: set.prescribed, status: 'skipped', actual: null, rpe: null }; }

export function startSession(revision: RoutineRevision, weekId: UUID, dayId: UUID, date: LocalDate, now = new Date().toISOString()): TrainingSession {
  localDate(date);
  const week = revision.content.weeks.find(item => item.id === weekId);
  const day = week?.days.find(item => item.id === dayId);
  if (!week || !day || revision.archived) throw new Error('El día o la revisión no están disponibles.');
  return {
    id: newId(), personId: revision.personId, createdAt: now, updatedAt: now, date, status: 'draft', version: 0,
    source: { planId: revision.planId, revisionId: revision.id, weekId, dayId },
    labels: { routine: revision.name, week: week.name, day: day.name, routineNotes: revision.content.notes },
    startedAt: now, completedAt: null, durationMinutes: null, durationSource: null, notes: '',
    personExerciseKeys: [...new Set(day.exercises.map(item => `${revision.personId}:${item.exercise.exerciseId}`))],
    exercises: day.exercises.map(item => ({ id: newId(), exercise: structuredClone(item.exercise), notes: item.notes,
      sets: item.sets.map(set => ({ id: newId(), prescribed: structuredClone(set), status: 'draft', actual: blankPerformance(prescriptionType(item.exercise.loggingType)), rpe: null })) })),
  };
}
/** Actual corrections never change the prescribed identity, media or targets. */
export function frozenSession(session: TrainingSession): unknown {
  return { id: session.id, personId: session.personId, createdAt: session.createdAt, startedAt: session.startedAt,
    source: session.source, labels: session.labels, personExerciseKeys: session.personExerciseKeys,
    exercises: session.exercises.map(item => ({ id: item.id, exercise: item.exercise, notes: item.notes, sets: item.sets.map(set => ({ id: set.id, prescribed: set.prescribed })) })) };
}
export function sessionErrors(session: TrainingSession): string[] {
  const errors: string[] = [];
  try { localDate(session.date); } catch { errors.push('Indica una fecha local válida.'); }
  if (session.durationMinutes !== null && (!positive(session.durationMinutes) || session.durationMinutes > 1440)) errors.push('La duración de sesión debe ser mayor que cero y no superar 1440 minutos.');
  if (session.notes.length > 2000) errors.push('Las notas admiten hasta 2000 caracteres.');
  if (!session.exercises.length) errors.push('La sesión no contiene ejercicios.');
  const ids = new Set<string>();
  for (const exercise of session.exercises) {
    if (!exercise.sets.length) errors.push('El ejercicio no contiene series.');
    for (const set of exercise.sets) {
      if (ids.has(set.id)) errors.push('Las series necesitan identidades únicas.'); ids.add(set.id);
      const prefix = `${exercise.exercise.name}, serie ${exercise.sets.indexOf(set) + 1}: `;
      if (set.status === 'draft') errors.push(`${prefix}complétala o márcala como no realizada.`);
      else if (set.status === 'completed') {
        errors.push(...actualErrors(set.actual, set.rpe, prescriptionType(exercise.exercise.loggingType)).map(error => prefix + error));
        if (!Number.isFinite(Date.parse(set.completedAt))) errors.push(`${prefix}falta la fecha de registro.`);
      } else if (set.status !== 'skipped' || set.actual !== null || set.rpe !== null) errors.push(`${prefix}estado no válido.`);
    }
  }
  return errors;
}
export function targetText(set: SetPrescription | null): string {
  if (!set) return 'Sin prescripción';
  if ('reps' in set) return `${set.reps.minimum}–${set.reps.maximum} rep · ${set.type === 'weight-reps' ? `${set.weightKg ?? '—'} kg externos` : set.type === 'assisted-reps' ? `${set.assistanceKg ?? '—'} kg de asistencia` : 'Peso corporal'} · RIR objetivo ${set.targetRir ?? '—'}`;
  return `${set.type === 'distance-duration' ? `${set.meters} m · ` : ''}${set.seconds ?? '—'} s`;
}
export function actualText(set: ActualSet): string {
  if (set.status === 'skipped') return 'No realizada';
  const a = set.actual;
  return `${set.status === 'draft' ? 'Borrador, sin confirmar: ' : ''}${'reps' in a ? `${a.reps ?? '—'} rep · ${a.type === 'weight-reps' ? `${a.weightKg ?? '—'} kg externos` : a.type === 'assisted-reps' ? `${a.assistanceKg ?? '—'} kg de asistencia` : 'Peso corporal'} · RIR real ${a.rir ?? '—'}` : `${a.type === 'distance-duration' ? `${a.meters ?? '—'} m · ` : ''}${a.seconds ?? '—'} s`} · RPE ${set.rpe ?? '—'}`;
}
