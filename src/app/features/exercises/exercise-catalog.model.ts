import { z } from 'zod';
import type { CustomExercise, ExerciseSnapshot } from './exercise.model';

export const categoryLabels = { strength: 'Fuerza', cardio: 'Cardio', stretching: 'Estiramiento', mobility: 'Movilidad', other: 'Otros' } as const;
export const customLoggingLabels = { weight_reps: 'Peso y repeticiones', bodyweight_reps: 'Peso corporal y repeticiones', assisted_bodyweight: 'Asistencia y repeticiones', duration: 'Duración', distance_duration: 'Distancia y duración' } as const;
export const loggingLabels = { ...customLoggingLabels, 'weight-reps': customLoggingLabels.weight_reps, 'bodyweight-reps': customLoggingLabels.bodyweight_reps, 'assisted-reps': customLoggingLabels.assisted_bodyweight, 'distance-duration': customLoggingLabels.distance_duration } as const;
export function customLoggingType(value: string): string {
  return ({ 'weight-reps': 'weight_reps', 'bodyweight-reps': 'bodyweight_reps', 'assisted-reps': 'assisted_bodyweight', 'distance-duration': 'distance_duration' } as Record<string, string>)[value] ?? value;
}
export const semanticLabels = { 'position-pair': 'Posiciones de referencia', 'partial-sequence': 'Secuencia parcial', 'static-references': 'Referencias estáticas', 'setup-to-hold': 'Preparación y postura sostenida' } as const;
const category = z.enum(['strength', 'cardio', 'stretching', 'mobility', 'other']);
const loggingType = z.enum(['weight-reps', 'bodyweight-reps', 'assisted-reps', 'duration', 'distance-duration']);
const text = z.string().min(1);
const url = z.url().refine(value => value.startsWith('https://'));
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const attribution = z.object({ creator: text, creatorUrl: url, license: z.literal('CC BY-SA 4.0'), licenseUrl: url,
  source: z.object({ name: text, url, license: text, licenseUrl: url, changes: text }).optional() });
const frame = z.object({ path: z.string().regex(/^exercises\/[a-z0-9-]+-[123]\.svg$/), frame: z.number().int().min(1).max(3), label: text, sha256: hash,
  attribution: attribution.extend({ sourceUrl: url, collectionCredit: z.object({ author: text, url, license: text, licenseUrl: url, scope: text }), localChanges: text }) });
const entry = z.object({ id: text, slug: z.string().regex(/^[a-z0-9-]+$/), name: text, aliases: z.array(text), instruction: text,
  category, loggingType, muscles: z.array(text).min(1), equipment: z.array(text).min(1),
  source: z.object({ revision: text, originalName: text, originalEquipment: text, attribution }),
  media: z.object({ mode: z.enum(['movement', 'cycle', 'hold']), semantics: z.enum(['position-pair', 'partial-sequence', 'static-references', 'setup-to-hold']), description: text,
    frames: z.tuple([frame, frame]), review: z.object({ sourcePosition: z.number().int().min(1).max(302), evidence: text, sheet: text, note: text }) }) });
const catalog = z.object({ version: z.literal(1), language: z.literal('es'),
  source: z.object({ revision: z.literal('aac599224bb9780305239607ef98540b7e0ce389'), manifestSha256: hash, license: z.literal('CC-BY-SA-4.0') }),
  licenseNotice: z.literal('licenses/exercises-notice.txt'), entries: z.array(entry).length(250) });
export type CatalogExercise = z.infer<typeof entry>;
export type ExerciseChoice = { kind: 'catalog'; id: string; name: string; entry: CatalogExercise } | { kind: 'custom'; id: string; name: string; entry: CustomExercise };

export function parseExerciseCatalog(input: unknown): CatalogExercise[] {
  const parsed = catalog.parse(input);
  const ids = new Set<string>();
  for (const exercise of parsed.entries) {
    const media = exercise.media;
    if (ids.has(exercise.id) || exercise.id !== `exercise-${exercise.slug}` || exercise.source.revision !== parsed.source.revision ||
      media.frames[0].frame === media.frames[1].frame || media.frames.some(frame => frame.path !== `exercises/${exercise.slug}-${frame.frame}.svg`) ||
      (media.mode === 'movement' ? media.semantics !== 'position-pair' : media.mode === 'cycle' ? media.semantics !== 'partial-sequence' : !['static-references', 'setup-to-hold'].includes(media.semantics))) {
      throw new Error('Invalid exercise identity, frame order or semantics.');
    }
    ids.add(exercise.id);
  }
  return parsed.entries;
}
export function catalogChoice(entry: CatalogExercise): ExerciseChoice { return { kind: 'catalog', id: entry.id, name: entry.name, entry }; }
export function customChoice(entry: CustomExercise): ExerciseChoice { return { kind: 'custom', id: entry.id, name: entry.name, entry }; }
/** Detached, lossless media for later routine/log/PDF consumers; never invent start/end credits. */
export function exerciseSnapshot(choice: ExerciseChoice): ExerciseSnapshot {
  const entry = choice.entry;
  return structuredClone({ exerciseId: choice.id, name: choice.name, category: entry.category, loggingType: entry.loggingType, instruction: entry.instruction,
    media: choice.kind === 'catalog' ? choice.entry.media : null,
    catalogVersion: choice.kind === 'catalog' ? `1/${choice.entry.source.revision}` : null,
    ...(choice.kind === 'catalog' ? { muscles: choice.entry.muscles, equipment: choice.entry.equipment, source: choice.entry.source } : { notes: choice.entry.notes ?? '', equipment: choice.entry.equipment ?? [] }) });
}
export interface ExerciseFilters { query: string; category: string; muscle: string; equipment: string }
export function normalizeExerciseSearch(value: string): string { return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').trim(); }
export function filterExercises(exercises: ExerciseChoice[], filters: ExerciseFilters): ExerciseChoice[] {
  const terms = normalizeExerciseSearch(filters.query).split(/\s+/).filter(Boolean);
  return exercises.filter(exercise => {
    const search = normalizeExerciseSearch([exercise.name, ...(exercise.kind === 'catalog' ? exercise.entry.aliases : [])].join(' '));
    return terms.every(term => search.includes(term)) && (!filters.category || exercise.entry.category === filters.category) &&
      (!filters.muscle || exercise.kind === 'catalog' && exercise.entry.muscles.includes(filters.muscle)) &&
      (!filters.equipment || !!exercise.entry.equipment?.includes(filters.equipment));
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
export function validateCustomExercise(input: unknown) {
  return z.object({ name: z.string().trim().min(1).max(160), category,
    loggingType: z.string().transform(customLoggingType).pipe(z.enum(['weight_reps', 'bodyweight_reps', 'assisted_bodyweight', 'duration', 'distance_duration'])),
    instruction: z.string().trim().max(1000).default(''), notes: z.string().trim().max(1000).default(''),
    equipment: z.string().trim().max(500).default('').transform(value => [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))]) }).parse(input);
}
