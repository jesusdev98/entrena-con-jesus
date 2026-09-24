import { z } from 'zod';
import { localDate } from '../../core/domain/identity';
import { actualErrors } from '../training/training-domain';
import { today } from '../progress/training-history';
import { prescriptionType } from '../routines/routine-planning';
import { amount, boundedJSON, exercise, food, instant, label, note, optional, positive, safe, sets, sourcePerson, uuid } from './transfer-schema';

const date = z.iso.date().transform(value => localDate(value));
const actual = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('weight-reps'), weightKg: amount, reps: positive.int(), rir: optional }),
  z.strictObject({ type: z.literal('bodyweight-reps'), reps: positive.int(), rir: optional }),
  z.strictObject({ type: z.literal('assisted-reps'), assistanceKg: amount, reps: positive.int(), rir: optional }),
  z.strictObject({ type: z.literal('duration'), seconds: positive }),
  z.strictObject({ type: z.literal('distance-duration'), meters: positive, seconds: positive }),
]);
const baseSet = { id: uuid, prescribed: sets.nullable() };
const performed = z.discriminatedUnion('status', [
  z.strictObject({ ...baseSet, status: z.literal('completed'), actual, rpe: positive.max(10), completedAt: instant }),
  z.strictObject({ ...baseSet, status: z.literal('skipped'), actual: z.null(), rpe: z.null() }),
]);
const session = z.strictObject({ id: uuid, personId: uuid, createdAt: instant, updatedAt: instant, date,
  status: z.literal('completed'), version: positive.int().max(1e6), startedAt: instant, completedAt: instant,
  source: z.strictObject({ planId: uuid, revisionId: uuid, weekId: uuid, dayId: uuid }).nullable(),
  labels: z.strictObject({ routine: label, week: label, day: label, routineNotes: safe }),
  exercises: z.array(z.strictObject({ id: uuid, exercise, sets: z.array(performed).min(1).max(30), notes: note })).min(1).max(100),
  durationMinutes: positive.max(1440).nullable(), durationSource: z.literal('manual').nullable(), notes: safe,
});
const foodLog = z.strictObject({ id: uuid, personId: uuid, createdAt: instant, updatedAt: instant, date,
  mealLabel: label, food, grams: positive, source: z.strictObject({ planId: uuid, revisionId: uuid, mealId: uuid,
    plannedFoodId: uuid, consumptionId: uuid }).nullable() });
export const progressEnvelope = z.strictObject({ app: z.literal('entrena-con-jesus'), schemaVersion: z.literal(1), kind: z.literal('progress'),
  exportId: uuid, exportedAt: instant, sourcePerson, from: date, through: date,
  payload: z.strictObject({ sessions: z.array(session).max(120), foodLogs: z.array(foodLog).max(600) }) });
export type ProgressFile = z.infer<typeof progressEnvelope>;
export type WireSession = ProgressFile['payload']['sessions'][number];
export type WireFoodLog = ProgressFile['payload']['foodLogs'][number];

function validInstant(value: string, max: number): boolean { return Number.isFinite(Date.parse(value)) && Date.parse(value) <= max; }
export function parseProgressFile(text: string): ProgressFile {
  const file = progressEnvelope.parse(boundedJSON(text));
  if (!file.payload.sessions.length && !file.payload.foodLogs.length) throw new Error('No hay progreso real guardado en el intervalo elegido.');
  const now = Date.now() + 5 * 60_000;
  if (!validInstant(file.exportedAt, now) || file.from > file.through ||
    (Date.parse(`${file.through}T12:00:00Z`) - Date.parse(`${file.from}T12:00:00Z`)) / 86_400_000 > 30 ||
    file.through > today()) throw new Error('Intervalo de progreso inválido o futuro (máximo 31 días).');
  const ids = new Set<string>();
  const check = (record: WireSession | WireFoodLog, kind: string) => {
    const key = `${kind}:${record.id}`;
    if (ids.has(key) || record.personId !== file.sourcePerson.personId || record.date < file.from || record.date > file.through ||
      !validInstant(record.createdAt, now) || !validInstant(record.updatedAt, now) ||
      Date.parse(record.createdAt) > Date.parse(record.updatedAt) || Date.parse(record.updatedAt) > Date.parse(file.exportedAt))
      throw new Error('Registro repetido, fuera del intervalo, ajeno a la persona o con fecha futura.');
    ids.add(key);
  };
  for (const row of file.payload.sessions) {
    check(row, 'session');
    if (!validInstant(row.startedAt, now) || !validInstant(row.completedAt, now) || Date.parse(row.startedAt) > Date.parse(row.completedAt) ||
      Date.parse(row.completedAt) > Date.parse(row.updatedAt) || (row.durationMinutes === null) !== (row.durationSource === null)) throw new Error('Fechas o duración de sesión inválidas.');
    const nested = new Set<string>();
    for (const item of row.exercises) {
      if (nested.has(item.id)) throw new Error('Ejercicios repetidos en una sesión.');
      nested.add(item.id);
      for (const set of item.sets) {
        if (nested.has(set.id) || (!('catalogId' in item.exercise) && set.prescribed && set.prescribed.type !== prescriptionType(item.exercise.loggingType))) throw new Error('Series repetidas o prescripción incompatible.');
        nested.add(set.id);
        if (set.status === 'completed' && (set.rpe * 2 !== Math.round(set.rpe * 2) || (!('catalogId' in item.exercise) && actualErrors(set.actual, set.rpe, prescriptionType(item.exercise.loggingType)).length) ||
          !validInstant(set.completedAt, now))) throw new Error('Métricas reales inválidas.');
      }
    }
  }
  for (const row of file.payload.foodLogs) {
    check(row, 'food');
    if (!('catalogId' in row.food) && row.food.foodId !== row.food.source.customFoodId) throw new Error('El origen del alimento no coincide con su ID.');
  }
  return file;
}
