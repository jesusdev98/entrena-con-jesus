import { newId, type UUID } from '../../core/domain/identity';
import type { LoggingType, ExerciseSnapshot } from '../exercises/exercise.model';
import { customLoggingType } from '../exercises/exercise-catalog.model';
import type { PlannedSetDraft, RoutineContent, RoutineContentDraft, RoutineDayDraft, RoutineExerciseDraft, RoutineWeekDraft, SetPrescription } from './routine.model';

export function prescriptionType(type: LoggingType): SetPrescription['type'] {
  switch (customLoggingType(type)) {
    case 'weight_reps': return 'weight-reps';
    case 'bodyweight_reps': return 'bodyweight-reps';
    case 'assisted_bodyweight': return 'assisted-reps';
    case 'distance_duration': return 'distance-duration';
    case 'duration': return 'duration';
    default: throw new Error('Tipo de registro no reconocido.');
  }
}
export function newSet(type: LoggingType): PlannedSetDraft {
  const base = { id: newId(), restSeconds: null, notes: '' };
  switch (prescriptionType(type)) {
    case 'weight-reps': return { ...base, type: 'weight-reps', reps: { minimum: null, maximum: null }, weightKg: null, targetRir: null };
    case 'bodyweight-reps': return { ...base, type: 'bodyweight-reps', reps: { minimum: null, maximum: null }, targetRir: null };
    case 'assisted-reps': return { ...base, type: 'assisted-reps', reps: { minimum: null, maximum: null }, assistanceKg: null, targetRir: null };
    case 'duration': return { ...base, type: 'duration', seconds: null };
    case 'distance-duration': return { ...base, type: 'distance-duration', meters: null, seconds: null };
  }
}
export function newExercise(exercise: ExerciseSnapshot): RoutineExerciseDraft {
  return { id: newId(), exercise: structuredClone(exercise), notes: '', sets: [newSet(exercise.loggingType)] };
}
export function newDay(): RoutineDayDraft { return { id: newId(), name: 'Día de entrenamiento', exercises: [] }; }
export function newWeek(): RoutineWeekDraft { return { id: newId(), name: 'Semana', days: [newDay()] }; }
export function duplicateSet(value: PlannedSetDraft): PlannedSetDraft { return { ...structuredClone(value), id: newId() }; }
export function duplicateExercise(value: RoutineExerciseDraft): RoutineExerciseDraft { return { ...structuredClone(value), id: newId(), sets: value.sets.map(duplicateSet) }; }
export function duplicateDay(value: RoutineDayDraft): RoutineDayDraft { return { ...structuredClone(value), id: newId(), exercises: value.exercises.map(duplicateExercise) }; }
export function duplicateWeek(value: RoutineWeekDraft): RoutineWeekDraft { return { ...structuredClone(value), id: newId(), days: value.days.map(duplicateDay) }; }
export function duplicateContent(value: RoutineContentDraft): RoutineContentDraft { return { ...structuredClone(value), weeks: value.weeks.map(duplicateWeek) }; }
export type RowAction = 'up' | 'down' | 'duplicate' | 'remove';
export function editRows<T extends { id: UUID }>(rows: T[], id: UUID, action: RowAction, duplicate: (value: T) => T): T[] {
  const index = rows.findIndex(row => row.id === id);
  if (index < 0) return rows;
  const result = [...rows];
  if (action === 'remove') result.splice(index, 1);
  else if (action === 'duplicate') result.splice(index + 1, 0, duplicate(rows[index]));
  else {
    const target = index + (action === 'up' ? -1 : 1);
    if (target < 0 || target >= rows.length) return rows;
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const positive = (value: unknown): value is number => nonnegative(value) && value > 0;
const optional = (value: unknown) => value === null || nonnegative(value);
const text = (value: string) => !!value.trim() && value.length <= 160;
export function setErrors(set: PlannedSetDraft): string[] {
  const errors: string[] = [];
  if ('rpe' in set) errors.push('El esfuerzo real no pertenece a la planificación.');
  if (!optional(set.restSeconds)) errors.push('El descanso debe ser un número no negativo de segundos.');
  if (set.notes.length > 1000) errors.push('Las notas de serie admiten hasta 1000 caracteres.');
  if ('reps' in set) {
    if (!positive(set.reps.minimum) || !Number.isInteger(set.reps.minimum) || !positive(set.reps.maximum) || !Number.isInteger(set.reps.maximum) || set.reps.maximum < set.reps.minimum) errors.push('Indica repeticiones enteras positivas: mínimo ≤ máximo.');
    if (!optional(set.targetRir)) errors.push('El RIR objetivo debe ser un número no negativo.');
    if (set.type === 'weight-reps' && !optional(set.weightKg)) errors.push('El peso debe ser un número no negativo de kg.');
    if (set.type === 'assisted-reps' && !optional(set.assistanceKg)) errors.push('La asistencia debe ser un número no negativo de kg.');
  } else {
    if ('targetRir' in set) errors.push('Las series de tiempo o distancia no admiten RIR.');
    if (set.type === 'duration' && !positive(set.seconds)) errors.push('Indica una duración mayor que cero en segundos.');
    if (set.type === 'distance-duration' && (!positive(set.meters) || !(set.seconds === null || positive(set.seconds)))) errors.push('Indica metros mayores que cero y, si hay duración, segundos mayores que cero.');
  }
  return errors;
}
export function routineErrors(name: string, content: RoutineContentDraft): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const identity = (id: UUID) => { if (!id || ids.has(id)) errors.push('Cada semana, día, ejercicio y serie necesita una identidad única.'); ids.add(id); };
  if (!text(name)) errors.push('Indica un nombre de rutina de 1 a 160 caracteres.');
  if (content.notes.length > 2000) errors.push('Las notas de rutina admiten hasta 2000 caracteres.');
  if (!content.weeks.length) errors.push('Añade al menos una semana.');
  content.weeks.forEach((week, wi) => {
    identity(week.id); const wp = `Semana ${wi + 1}`;
    if (!text(week.name)) errors.push(`${wp}: indica una etiqueta de 1 a 160 caracteres.`);
    if (!week.days.length) errors.push(`${wp}: añade al menos un día de entrenamiento.`);
    week.days.forEach((day, di) => {
      identity(day.id); const dp = `${wp}, día ${di + 1}`;
      if (!text(day.name)) errors.push(`${dp}: indica una etiqueta de 1 a 160 caracteres.`);
      if (!day.exercises.length) errors.push(`${dp}: añade al menos un ejercicio.`);
      day.exercises.forEach((exercise, ei) => {
        identity(exercise.id); const ep = `${dp}, ejercicio ${ei + 1} (${exercise.exercise.name})`;
        if (!exercise.sets.length) errors.push(`${ep}: añade al menos una serie.`);
        if (exercise.notes.length > 1000) errors.push(`${ep}: las notas admiten hasta 1000 caracteres.`);
        exercise.sets.forEach((set, si) => {
          identity(set.id);
          if (set.type !== prescriptionType(exercise.exercise.loggingType)) errors.push(`${ep}: la serie no corresponde al tipo de ejercicio.`);
          errors.push(...setErrors(set).map(error => `${ep}, serie ${si + 1}: ${error}`));
        });
      });
    });
  });
  return errors;
}
export function savedContent(name: string, content: RoutineContentDraft): RoutineContent {
  const errors = routineErrors(name, content);
  if (errors.length) throw new Error(errors.join('\n'));
  return structuredClone(content) as RoutineContent;
}
