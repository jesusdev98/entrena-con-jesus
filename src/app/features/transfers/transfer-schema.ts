import { z } from 'zod';
import type { UUID } from '../../core/domain/identity';
import { savedContent as savedRoutine } from '../routines/routine-planning';
import { savedContent as savedMeal } from '../nutrition/meal-plans/meal-planning';

export const MAX_PLAN_BYTES = 512 * 1024;
export const uuid = z.uuid().refine(value => value === value.toLowerCase(), 'Usa UUID canónicos en minúsculas.').transform(value => value as UUID);
export const instant = z.iso.datetime({ offset: true });
export const safe = z.string().max(2000).refine(value => !/[<>]/.test(value) && !/(?:https?:\/\/|data:|javascript:|file:|blob:)/i.test(value), 'No se admiten HTML ni enlaces en los datos compartidos.');
export const label = safe.min(1).max(160);
export const note = safe.max(1000);
export const amount = z.number().finite().nonnegative().max(1e9);
export const positive = amount.positive();
export const optional = amount.nullable();
const owned = z.strictObject({ id: uuid, personId: uuid, createdAt: instant, updatedAt: instant });
const customExercise = owned.extend({ name: label, category: z.enum(['strength', 'cardio', 'stretching', 'mobility', 'other']),
  loggingType: z.enum(['weight_reps', 'bodyweight_reps', 'assisted_bodyweight', 'duration', 'distance_duration', 'weight-reps', 'bodyweight-reps', 'assisted-reps', 'distance-duration']),
  instruction: note, notes: note.optional(), equipment: z.array(label).max(30).optional(), archived: z.boolean().optional() });
export const nutrients = z.strictObject({ kcal: amount, protein: amount, carbohydrate: amount, fat: amount });
const customFood = owned.extend({ name: label, per100g: nutrients, archived: z.boolean().optional(),
  source: z.strictObject({ kind: z.literal('user'), note }).optional() });
const snapshotExercise = z.strictObject({ exerciseId: uuid, name: label,
  category: z.enum(['strength', 'cardio', 'stretching', 'mobility', 'other']),
  loggingType: customExercise.shape.loggingType, instruction: note, media: z.null(), catalogVersion: z.null(),
  muscles: z.array(label).max(30).optional(), equipment: z.array(label).max(30).optional(), notes: note.optional() });
export const exercise = z.union([z.strictObject({ catalogId: z.string().regex(/^exercise-[a-z0-9-]+$/).max(160), version: label }), snapshotExercise]);
export const food = z.union([z.strictObject({ catalogId: z.string().regex(/^fdc-\d+$/).max(40), version: label }),
  z.strictObject({ foodId: uuid, name: label, per100g: nutrients, source: z.strictObject({ customFoodId: uuid }) })]);
const reps = z.strictObject({ minimum: positive.int(), maximum: positive.int() });
const baseSet = { id: uuid, restSeconds: optional, notes: note };
export const sets = z.discriminatedUnion('type', [
  z.strictObject({ ...baseSet, type: z.literal('weight-reps'), reps, weightKg: optional, targetRir: optional }),
  z.strictObject({ ...baseSet, type: z.literal('bodyweight-reps'), reps, targetRir: optional }),
  z.strictObject({ ...baseSet, type: z.literal('assisted-reps'), reps, assistanceKg: optional, targetRir: optional }),
  z.strictObject({ ...baseSet, type: z.literal('duration'), seconds: positive }),
  z.strictObject({ ...baseSet, type: z.literal('distance-duration'), meters: positive, seconds: z.union([positive, z.null()]) }),
]);
const routineContent = z.strictObject({ notes: safe, weeks: z.array(z.strictObject({ id: uuid, name: label,
  days: z.array(z.strictObject({ id: uuid, name: label, exercises: z.array(z.strictObject({ id: uuid, exercise,
    sets: z.array(sets).min(1).max(30), notes: note })).min(1).max(50) })).min(1).max(14) })).min(1).max(12) });
const mealContent = z.strictObject({ notes: safe, weeks: z.array(z.strictObject({ id: uuid, name: label,
  days: z.array(z.strictObject({ id: uuid, name: label, meals: z.array(z.strictObject({ id: uuid, name: label,
    foods: z.array(z.strictObject({ id: uuid, food, grams: positive })).max(100) })).min(1).max(20) })).min(1).max(14) })).min(1).max(12) });
const plan = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('routine'), planId: uuid, revisionId: uuid, parentRevisionId: uuid.nullable(), name: label,
    archived: z.boolean(), content: routineContent }),
  z.strictObject({ type: z.literal('meal-plan'), planId: uuid, revisionId: uuid, parentRevisionId: uuid.nullable(), name: label,
    archived: z.boolean(), content: mealContent }),
]);
export const sourcePerson = z.strictObject({ workspaceId: uuid, personId: uuid, displayName: label });
export const planEnvelope = z.strictObject({ app: z.literal('entrena-con-jesus'), schemaVersion: z.literal(1), kind: z.literal('plan'),
  exportId: uuid, exportedAt: instant, sourcePerson,
  payload: z.strictObject({ plans: z.array(plan).length(1), customExercises: z.array(customExercise).max(100), customFoods: z.array(customFood).max(100) }) });
export type PlanFile = z.infer<typeof planEnvelope>;
export type WirePlan = PlanFile['payload']['plans'][number];

/** Bound the input before parsing, including structural complexity and unexpected fields. */
export function boundedJSON(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > MAX_PLAN_BYTES) throw new Error('El archivo supera el límite de 512 KiB.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('El archivo JSON está dañado.'); }
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (++nodes > 12000 || item.depth > 18) throw new Error('El archivo excede los límites de estructura.');
    if (item.value && typeof item.value === 'object') {
      if (Array.isArray(item.value)) {
        if (item.value.length > 1200) throw new Error('El archivo contiene demasiados elementos.');
        for (const child of item.value) stack.push({ value: child, depth: item.depth + 1 });
      } else for (const child of Object.values(item.value)) stack.push({ value: child, depth: item.depth + 1 });
    }
  }
  return value;
}

export function parsePlanFile(text: string): PlanFile {
  const file = planEnvelope.parse(boundedJSON(text));
  const exerciseIds = new Set(file.payload.customExercises.map(item => item.id));
  const foodIds = new Set(file.payload.customFoods.map(item => item.id));
  const usedExercises = new Set<UUID>();
  const usedFoods = new Set<UUID>();
  if (exerciseIds.size !== file.payload.customExercises.length || foodIds.size !== file.payload.customFoods.length) throw new Error('Referencias personalizadas repetidas.');
  for (const plan of file.payload.plans) {
    if (plan.parentRevisionId === plan.revisionId) throw new Error('Una revisión no puede ser su propio origen.');
    if (plan.type === 'routine') {
      for (const week of plan.content.weeks) for (const day of week.days) for (const row of day.exercises) {
        if (!('catalogId' in row.exercise)) {
          if (!exerciseIds.has(row.exercise.exerciseId)) throw new Error('Falta un ejercicio personalizado referenciado.');
          usedExercises.add(row.exercise.exerciseId);
        }
      }
    } else for (const week of plan.content.weeks) for (const day of week.days) for (const meal of day.meals) for (const row of meal.foods) {
      if (!('catalogId' in row.food)) {
        if (row.food.foodId !== row.food.source.customFoodId || !foodIds.has(row.food.foodId)) throw new Error('Falta un alimento personalizado referenciado.');
        usedFoods.add(row.food.foodId);
      }
    }
  }
  if (usedExercises.size !== exerciseIds.size || usedFoods.size !== foodIds.size) throw new Error('El archivo incluye datos personales ajenos al plan seleccionado.');
  return file;
}

export function validateHydratedPlan(type: WirePlan['type'], name: string, content: unknown): void {
  if (type === 'routine') savedRoutine(name, content as Parameters<typeof savedRoutine>[1]);
  else savedMeal(name, content as Parameters<typeof savedMeal>[1]);
}
