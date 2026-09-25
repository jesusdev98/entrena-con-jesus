import { z } from 'zod';
import { localDate } from '../../core/domain/identity';
import type { BackupPayload } from './transfer.model';
import { instant, uuid, sets } from './transfer-schema';
import { personFormSchema } from '../people/person.validation';
import { savedContent as savedRoutine } from '../routines/routine-planning';
import { savedContent as savedMeal } from '../nutrition/meal-plans/meal-planning';
import { parseMetCatalog } from '../activity/met-catalog';
import { ENERGY_VERSION } from '../nutrition/calculations/daily-expenditure';

export const BACKUP_STORES = ['settings', 'people', 'profileRevisions', 'customExercises', 'customFoods',
  'routineRevisions', 'mealPlanRevisions', 'trainingSessions', 'foodLogs', 'dailySnapshots',
  'mealConsumptions', 'drafts', 'externalSubjects'] as const;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const owned = { id: uuid, personId: uuid, createdAt: instant, updatedAt: instant };
const json = z.unknown();
const demoIdentity = z.strictObject({ id: uuid, createdAt: instant });
const demoReceipt = z.strictObject({ personId: uuid, trainerPersonId: uuid.nullable(), trainerPersonCreatedAt: instant.nullable(), profileRevision: demoIdentity,
  routine: z.strictObject({ planId: uuid, revision: demoIdentity }), mealPlan: z.strictObject({ planId: uuid, revision: demoIdentity }),
  sessions: z.array(demoIdentity).length(21), foodLogs: z.array(demoIdentity).length(96), snapshots: z.array(demoIdentity).length(12) });
const settings = z.strictObject({ id: z.literal('workspace'), workspaceId: uuid, mode: z.enum(['trainer', 'client']).nullable(),
  personalPersonId: uuid, activePersonId: uuid, lastTrainerPersonId: uuid,
  demoSeed: z.strictObject({ version: z.literal(1), status: z.enum(['eligible', 'seeded', 'ineligible', 'cleared']), receipt: demoReceipt.optional() }).optional() });
const person = z.strictObject({ id: uuid, kind: z.enum(['personal', 'client']), displayName: z.string().min(1).max(160),
  reference: z.string().max(160), archived: z.boolean(), profile: json, createdAt: instant, updatedAt: instant });
const revision = { ...owned, planId: uuid, parentRevisionId: uuid.nullable(), name: z.string().min(1).max(160),
  content: json, archived: z.boolean().optional(), exchange: json.optional() };
const record = z.strictObject(owned);
const dateField = z.iso.date();
const draftPayload = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('person'), subjectId: uuid, value: json, baseUpdatedAt: z.string().nullable() }),
  z.strictObject({ kind: z.literal('custom-food'), foodId: uuid, value: json, baseUpdatedAt: z.string().nullable() }),
  z.strictObject({ kind: z.literal('custom-exercise'), exerciseId: uuid, value: json, baseUpdatedAt: z.string().nullable() }),
  z.strictObject({ kind: z.literal('routine'), planId: uuid, baseRevisionId: uuid.nullable(), name: z.string(), content: json }),
  z.strictObject({ kind: z.literal('meal-plan'), planId: uuid, baseRevisionId: uuid.nullable(), name: z.string(), content: json }),
  z.strictObject({ kind: z.literal('training'), session: json, baseSession: json.nullable() }),
  z.strictObject({ kind: z.literal('activity'), input: json }),
  z.strictObject({ kind: z.literal('daily-target'), date: dateField, context: json, value: json, base: json.nullable() }),
  z.strictObject({ kind: z.literal('food-diary'), date: dateField, food: json.nullable(), grams: z.number().finite().nullable(),
    mealLabel: z.string(), edit: json.nullable().optional() }),
]);
const payloadSchema = z.strictObject({
  settings: z.array(settings).length(1), people: z.array(person).min(1).max(500),
  profileRevisions: z.array(record.extend({ profile: json })).max(5000),
  customExercises: z.array(record.extend({ name: z.string().min(1), category: z.string(), loggingType: z.string(),
    instruction: z.string(), notes: z.string().optional(), equipment: json.optional(), archived: z.boolean().optional() })).max(5000),
  customFoods: z.array(record.extend({ name: z.string().min(1), per100g: json, archived: z.boolean().optional(), source: json.optional() })).max(5000),
  routineRevisions: z.array(z.strictObject(revision)).max(10000),
  mealPlanRevisions: z.array(z.strictObject(revision)).max(10000),
  trainingSessions: z.array(record.extend({ date: z.iso.date(), status: z.enum(['draft', 'completed']), source: json,
    labels: json, version: z.number().int().nonnegative(), startedAt: instant, completedAt: instant.nullable(),
    exercises: json, personExerciseKeys: json, durationMinutes: z.number().finite().nullable(),
    durationSource: z.literal('manual').nullable(), notes: z.string(), exchange: json.optional() })).max(30000),
  foodLogs: z.array(record.extend({ date: z.iso.date(), mealLabel: z.string(), food: json,
    grams: z.number().finite().positive(), source: json, exchange: json.optional() })).max(50000),
  dailySnapshots: z.array(z.union([
    record.extend({ schemaVersion: z.literal(2), version: z.number().int().positive(), date: dateField,
      context: z.strictObject({ profileRevisionId: uuid, profile: json, catalog: json, engineVersion: z.string() }), activity: json, calculation: json }),
    record.extend({ date: dateField, profileRevisionId: uuid, profile: json, activity: json, calculation: json,
      expenditureKcal: z.number().finite(), signedAdjustmentKcal: z.number().finite(), targetKcal: z.number().finite(),
      macroPercentages: json, macroGrams: json, provisional: z.boolean() }),
  ])).max(30000),
  mealConsumptions: z.array(record.extend({ date: z.iso.date(), planId: uuid.optional(), revisionId: uuid, mealId: uuid,
    state: z.enum(['consumed', 'undone']), foodLogIds: z.array(uuid).max(100) })).max(50000),
  drafts: z.array(record.extend({ editorKey: z.string().min(1), payload: draftPayload })).max(5000),
  externalSubjects: z.array(record.extend({ externalWorkspaceId: uuid, externalPersonId: uuid })).max(5000),
});
const envelope = z.strictObject({ app: z.literal('entrena-con-jesus'), schemaVersion: z.literal(1), kind: z.literal('backup'),
  exportId: uuid, exportedAt: instant, checksum: z.string().regex(/^[a-f0-9]{64}$/), payload: payloadSchema });
export type BackupFile = z.infer<typeof envelope> & { payload: BackupPayload };

const nutrients = z.strictObject({ kcal: z.number().finite().nonnegative(), protein: z.number().finite().nonnegative(),
  carbohydrate: z.number().finite().nonnegative(), fat: z.number().finite().nonnegative() });
const foodSnapshot = z.strictObject({ foodId: z.string().min(1).max(160), name: z.string().min(1).max(160), per100g: nutrients,
  source: z.union([z.strictObject({ customFoodId: uuid }), z.strictObject({ fdcId: z.string().min(1), version: z.string().min(1) })]) });
const credit = z.strictObject({ creator: z.string(), creatorUrl: z.string(), license: z.string(), licenseUrl: z.string(),
  source: z.strictObject({ name: z.string(), url: z.string(), license: z.string(), licenseUrl: z.string(), changes: z.string() }).optional() });
const frame = z.strictObject({ path: z.string(), frame: z.number().int().min(1).max(3), label: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  attribution: credit.extend({ sourceUrl: z.string(), collectionCredit: z.strictObject({ author: z.string(), url: z.string(), license: z.string(),
    licenseUrl: z.string(), scope: z.string() }), localChanges: z.string() }) });
const exerciseSnapshot = z.strictObject({ exerciseId: z.string().min(1).max(160), name: z.string().min(1).max(160),
  category: z.enum(['strength', 'cardio', 'stretching', 'mobility', 'other']),
  loggingType: z.enum(['weight_reps', 'bodyweight_reps', 'assisted_bodyweight', 'duration', 'distance_duration', 'weight-reps', 'bodyweight-reps', 'assisted-reps', 'distance-duration']),
  instruction: z.string(), catalogVersion: z.string().nullable(),
  media: z.union([z.null(), z.strictObject({ startAssetId: z.string(), finishAssetId: z.string(),
    credit: z.strictObject({ sourceUrl: z.string(), author: z.string(), license: z.string(), licenseUrl: z.string(), changes: z.string() }) }),
  z.strictObject({ mode: z.enum(['movement', 'cycle', 'hold']), semantics: z.enum(['position-pair', 'partial-sequence', 'static-references', 'setup-to-hold']),
    description: z.string(), frames: z.tuple([frame, frame]), review: z.strictObject({ sourcePosition: z.number().int(), evidence: z.string(), sheet: z.string(), note: z.string() }) })]),
  muscles: z.array(z.string()).optional(), equipment: z.array(z.string()).optional(), notes: z.string().optional(),
  source: z.strictObject({ revision: z.string(), originalName: z.string(), originalEquipment: z.string(), attribution: credit }).optional() });
const named = { id: uuid, name: z.string().min(1).max(160) };
const routineContent = z.strictObject({ notes: z.string(), weeks: z.array(z.strictObject({ ...named,
  days: z.array(z.strictObject({ ...named, exercises: z.array(z.strictObject({ id: uuid, exercise: exerciseSnapshot,
    sets: z.array(sets).min(1).max(30), notes: z.string() })).min(1).max(50) })).min(1).max(14) })).min(1).max(12) });
const mealContent = z.strictObject({ notes: z.string(), weeks: z.array(z.strictObject({ ...named,
  days: z.array(z.strictObject({ ...named, meals: z.array(z.strictObject({ ...named,
    foods: z.array(z.strictObject({ id: uuid, food: foodSnapshot, grams: z.number().finite().positive() })).max(100) })).min(1).max(20) })).min(1).max(14) })).min(1).max(12) });

/** SHA-256 detects accidental damage, not malicious modification or sender identity. */
export async function checksum(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
function invalid(field = ''): never { throw new Error(`Copia incompatible, incompleta o con referencias inválidas${field ? ` (${field})` : ''}. No se cambió ningún dato.`); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !z.uuid().safeParse(value).success || value !== value.toLowerCase()) return invalid();
  return value;
}
function date(value: unknown): void { if (typeof value !== 'string') invalid(); localDate(value); }
function unique<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map(items.map(row => [row.id, row]));
  if (map.size !== items.length) invalid();
  return map;
}

/** No executable resources or arbitrary remote asset references may enter personal records. */
function inspectTree(value: unknown): void {
  const stack = [{ value, depth: 0, key: '' }]; let count = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (++count > 350000 || item.depth > 40) invalid(item.key);
    if (typeof item.value === 'number' && (!Number.isFinite(item.value) || Math.abs(item.value) > 1e9)) invalid(item.key);
    if (typeof item.value === 'string') {
      const text = item.value;
      const comparableDescription = item.key === 'description' ? text.replace(/[<>]\s*=?\s*\d+(?:\.\d+)?/g, '') : text;
      if (text.length > 4096 || /[<>]/.test(comparableDescription) || /(?:javascript:|data:|blob:|file:)/i.test(text)) invalid(item.key);
      if (/https?:\/\//i.test(text) && !((['url', 'sourceUrl', 'creatorUrl', 'licenseUrl'].includes(item.key) && /^https:\/\/[a-z0-9.-]+(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%/?#-]*)?$/.test(text)) ||
        (item.key === 'citation' && /^.{1,300} https:\/\/www\.sciencedirect\.com\/science\/article\/pii\/S20952546230010(?:84|59)$/.test(text)))) invalid(item.key);
      if (item.key === 'path' && !/^exercises\/[a-z0-9-]+-[123]\.svg$/.test(text)) invalid(item.key);
      if (item.key === 'date') date(text);
      if ((item.key === 'id' || item.key.endsWith('Id')) && !['activityId', 'foodId', 'exerciseId', 'fdcId'].includes(item.key) &&
        text !== 'workspace' && !(item.key === 'id' && (/^(adult:\d{5}|older-adult:\d{5}60)$/.test(text) || text === 'residual-walking')) && !z.uuid().safeParse(text).success) invalid(item.key);
      if ((item.key.endsWith('At') || item.key === 'startedAt' || item.key === 'completedAt') &&
        !Number.isFinite(Date.parse(text))) invalid(item.key);
    }
    if (item.value && typeof item.value === 'object') {
      if (Array.isArray(item.value)) {
        if (item.value.length > 50000) invalid(item.key);
        for (const child of item.value) stack.push({ value: child, depth: item.depth + 1, key: item.key });
      } else for (const [key, child] of Object.entries(item.value)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key.length > 100) invalid(key);
        stack.push({ value: child, depth: item.depth + 1, key });
      }
    }
  }
}

export function validateBackup(payload: BackupPayload): void {
  inspectTree(payload);
  const s = payload.settings[0], people = unique(payload.people);
  if (payload.people.filter(p => p.kind === 'personal').length !== 1 ||
    people.get(s.personalPersonId)?.kind !== 'personal' || !people.has(s.activePersonId) || !people.has(s.lastTrainerPersonId) ||
    (s.mode !== 'trainer' && s.activePersonId !== s.personalPersonId) || people.get(s.activePersonId)?.archived) invalid();
  const receipt = s.demoSeed?.receipt;
  if (receipt) {
    if (!['seeded', 'cleared'].includes(s.demoSeed!.status) ||
      (receipt.trainerPersonId === null ? receipt.personId !== s.personalPersonId || receipt.trainerPersonCreatedAt !== null
        : receipt.trainerPersonId !== receipt.personId || receipt.trainerPersonCreatedAt === null)) invalid('demoSeed.receipt');
    const ids = [receipt.profileRevision, receipt.routine.revision, receipt.mealPlan.revision,
      ...receipt.sessions, ...receipt.foodLogs, ...receipt.snapshots].map(item => item.id);
    if (new Set(ids).size !== ids.length) invalid('demoSeed.receipt');
    const matches = (store: 'profileRevisions' | 'trainingSessions' | 'foodLogs' | 'dailySnapshots', entries: { id: string; createdAt: string }[]) => {
      for (const entry of entries) {
        const stored = payload[store].find(item => item.id === entry.id && item.personId === receipt.personId);
        if (stored && stored.createdAt !== entry.createdAt) invalid('demoSeed.receipt');
      }
    };
    matches('profileRevisions', [receipt.profileRevision]); matches('trainingSessions', receipt.sessions);
    matches('foodLogs', receipt.foodLogs); matches('dailySnapshots', receipt.snapshots);
    for (const [store, plan] of [['routineRevisions', receipt.routine], ['mealPlanRevisions', receipt.mealPlan]] as const) {
      const stored = payload[store].find(item => item.id === plan.revision.id && item.personId === receipt.personId);
      if (stored && (stored.createdAt !== plan.revision.createdAt || stored.planId !== plan.planId)) invalid('demoSeed.receipt');
    }
  }
  const keys = new Map<string, Set<string>>();
  for (const store of BACKUP_STORES.filter(name => name !== 'settings' && name !== 'people')) {
    const seen = new Set<string>(); keys.set(store, seen);
    for (const row of payload[store] as { id: string; personId: string; createdAt: string; updatedAt: string }[]) {
      const key = `${row.personId}:${row.id}`;
      if (seen.has(key) || !people.has(row.personId) || Date.parse(row.createdAt) > Date.parse(row.updatedAt)) invalid();
      seen.add(key);
    }
  }
  for (const p of payload.people) {
    if (Date.parse(p.createdAt) > Date.parse(p.updatedAt)) invalid();
    if (!personFormSchema.safeParse({ displayName: p.displayName, reference: p.reference, profile: p.profile }).success) invalid();
  }
  for (const r of payload.profileRevisions) if (!personFormSchema.safeParse({ displayName: 'Perfil', reference: '', profile: r.profile }).success) invalid();
  for (const r of payload.customExercises) if (!['strength', 'cardio', 'stretching', 'mobility', 'other'].includes(r.category) ||
    !['weight_reps', 'bodyweight_reps', 'assisted_bodyweight', 'duration', 'distance_duration', 'weight-reps', 'bodyweight-reps', 'assisted-reps', 'distance-duration'].includes(r.loggingType)) invalid();
  for (const revisions of [payload.routineRevisions, payload.mealPlanRevisions] as const) {
    const byId = new Map(revisions.map(row => [`${row.personId}:${row.id}`, row]));
    const checked = new Set<string>();
    for (const r of revisions) {
      if (r.parentRevisionId === r.id || !object(r.content)['weeks']) invalid();
      if (r.exchange) { const origin = object(r.exchange); id(origin['workspaceId']); id(origin['personId']); id(origin['planId']); id(origin['revisionId']); }
      const trail = new Set<string>(); let current: typeof r | undefined = r;
      while (current) {
        const key = `${current.personId}:${current.id}`;
        if (trail.has(key)) invalid('parentRevisionId');
        if (checked.has(key)) break;
        trail.add(key);
        const parent: typeof r | undefined = current.parentRevisionId ? byId.get(`${current.personId}:${current.parentRevisionId}`) : undefined;
        if (current.parentRevisionId && (!parent || parent.planId !== current.planId)) invalid('parentRevisionId');
        current = parent;
      }
      for (const key of trail) checked.add(key);
    }
  }
  const foreignOwner = (store: 'customExercises' | 'customFoods', owner: string, resource: string) =>
    payload[store].some(row => row.id === resource && row.personId !== owner) && !keys.get(store)?.has(`${owner}:${resource}`);
  for (const r of payload.routineRevisions) {
    if (!routineContent.safeParse(r.content).success) invalid('routineRevisions.content');
    try { savedRoutine(r.name, r.content); } catch { invalid('routineRevisions.content'); }
    for (const week of r.content.weeks) for (const day of week.days) for (const row of day.exercises)
      if (row.exercise.catalogVersion === null && foreignOwner('customExercises', r.personId, row.exercise.exerciseId)) invalid('routineRevisions.exercise');
  }
  for (const r of payload.mealPlanRevisions) {
    if (!mealContent.safeParse(r.content).success) invalid('mealPlanRevisions.content');
    try { savedMeal(r.name, r.content); } catch { invalid('mealPlanRevisions.content'); }
    for (const week of r.content.weeks) for (const day of week.days) for (const meal of day.meals) for (const row of meal.foods)
      if ('customFoodId' in row.food.source && foreignOwner('customFoods', r.personId, row.food.source.customFoodId)) invalid('mealPlanRevisions.food');
  }
  for (const r of payload.customFoods) {
    const n = object(r.per100g);
    if (['kcal', 'protein', 'carbohydrate', 'fat'].some(key => typeof n[key] !== 'number' || (n[key] as number) < 0)) invalid();
  }
  for (const r of payload.trainingSessions) {
    if (!Array.isArray(r.exercises) || !Array.isArray(r.personExerciseKeys) || r.version < 1 || (r.status === 'completed') !== (r.completedAt !== null)) invalid();
    if (r.personExerciseKeys.some(key => typeof key !== 'string' || !key.startsWith(`${r.personId}:`))) invalid();
    const seen = new Set<string>();
    for (const row of r.exercises) {
      if (!exerciseSnapshot.safeParse(row.exercise).success || seen.has(row.id) || !row.sets.length) invalid('trainingSessions.exercises');
      seen.add(row.id);
      for (const set of row.sets) {
        if (seen.has(set.id) || set.prescribed !== null && !sets.safeParse(set.prescribed).success ||
          !['draft', 'completed', 'skipped'].includes(set.status) || set.status === 'completed' &&
          (set.actual === null || set.rpe === null || !set.completedAt)) invalid('trainingSessions.sets');
        seen.add(set.id);
      }
    }
    const indexed = new Set(r.exercises.map(row => `${r.personId}:${row.exercise.exerciseId}`));
    if (new Set(r.personExerciseKeys).size !== r.personExerciseKeys.length ||
      r.personExerciseKeys.length !== indexed.size || r.personExerciseKeys.some(key => !indexed.has(key))) invalid('trainingSessions.personExerciseKeys');
    if (r.source) { const source = object(r.source); for (const key of ['planId', 'revisionId', 'weekId', 'dayId']) id(source[key]); }
    if (r.exchange) { const origin = object(r.exchange); id(origin['workspaceId']); id(origin['personId']); id(origin['recordId']); }
  }
  for (const r of payload.foodLogs) {
    const food = object(r.food), source = object(food['source']);
    if (!foodSnapshot.safeParse(r.food).success) invalid('foodLogs.food');
    const nutrients = object(food['per100g']);
    if (typeof food['name'] !== 'string' || ['kcal', 'protein', 'carbohydrate', 'fat'].some(key => typeof nutrients[key] !== 'number' || (nutrients[key] as number) < 0)) invalid();
    if ('customFoodId' in source && payload.customFoods.some(food => food.id === source['customFoodId'] && food.personId !== r.personId) &&
      !keys.get('customFoods')?.has(`${r.personId}:${source['customFoodId']}`)) invalid();
    if (r.source) { const plan = object(r.source); for (const key of ['planId', 'revisionId', 'mealId', 'plannedFoodId', 'consumptionId']) id(plan[key]); }
  }
  const dates = new Set<string>(), receipts = new Set<string>(), subjects = new Set<string>();
  for (const r of payload.dailySnapshots) {
    const key = `${r.personId}:${r.date}`; if (dates.has(key)) invalid(); dates.add(key);
    if (!('context' in r && 'calculation' in r || 'profile' in r && 'expenditureKcal' in r)) invalid();
    if ('context' in r) {
      const context = object(r.context);
      if (!context['catalog'] || !context['profile'] || !context['profileRevisionId'] ||
        context['engineVersion'] !== ENERGY_VERSION ||
        !personFormSchema.safeParse({ displayName: 'Perfil', reference: '', profile: context['profile'] }).success) invalid('dailySnapshots.context');
      try { parseMetCatalog(context['catalog']); } catch { invalid('dailySnapshots.context.catalog'); }
    }
  }
  for (const r of payload.mealConsumptions) {
    const key = `${r.personId}:${r.date}:${r.revisionId}:${r.mealId}`;
    if (receipts.has(key) || new Set(r.foodLogIds).size !== r.foodLogIds.length) invalid();
    for (const id of r.foodLogIds) {
      const log = payload.foodLogs.find(item => item.id === id && item.personId === r.personId);
      if (log && (log.date !== r.date || log.source?.consumptionId !== r.id)) invalid();
    }
    receipts.add(key);
  }
  const editorKeys = new Set<string>();
  for (const r of payload.drafts) {
    const key = `${r.personId}:${r.editorKey}`, draft = object(r.payload);
    if (editorKeys.has(key) || !['person', 'routine', 'meal-plan', 'training', 'daily-target', 'activity', 'food-diary', 'custom-food', 'custom-exercise'].includes(String(draft['kind']))) invalid();
    editorKeys.add(key);
    if (draft['kind'] === 'training' && object(draft['session'])['personId'] !== r.personId) invalid();
    if (draft['kind'] === 'food-diary' && draft['edit'] && object(object(draft['edit'])['base'])['personId'] !== r.personId) invalid('drafts.edit');
    if (draft['kind'] === 'daily-target' && (!draft['context'] || !draft['value'])) invalid('drafts.daily-target');
    if ((draft['kind'] === 'routine' || draft['kind'] === 'meal-plan') && (typeof draft['name'] !== 'string' || !Array.isArray(object(draft['content'])['weeks']))) invalid('drafts.content');
    if (draft['kind'] === 'person' && draft['subjectId'] !== r.personId && people.get(r.personId)?.kind !== 'personal') invalid();
  }
  for (const r of payload.externalSubjects) {
    const key = `${r.externalWorkspaceId}:${r.externalPersonId}`;
    if (subjects.has(key)) invalid(); subjects.add(key);
  }
}

export async function parseBackup(text: string): Promise<BackupFile> {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) invalid();
  let input: unknown;
  try { input = JSON.parse(text); } catch { return invalid(); }
  // Zod normalizes object field order. Verify the exact JSON payload before parsing;
  // retain its original key order for a subsequent confirmed restore.
  const raw = object(input);
  if (typeof raw['checksum'] !== 'string' || await checksum(raw['payload']) !== raw['checksum']) invalid();
  envelope.parse(input);
  const file = input as BackupFile;
  validateBackup(file.payload);
  return file;
}
