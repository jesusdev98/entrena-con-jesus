import { Injectable, inject } from '@angular/core';
import { localDate, newId, type LocalDate, type UUID } from '../../core/domain/identity';
import { Database, StorageFailure, storageFailure } from '../../core/storage/database';
import type { ExerciseSnapshot } from '../exercises/exercise.model';
import { exerciseSnapshot } from '../exercises/exercise-catalog.model';
import type { CatalogExercise } from '../exercises/exercise-catalog.model';
import type { CatalogFood } from '../nutrition/foods/food.model';
import { foodSnapshot } from '../nutrition/foods/food.model';
import type { FoodLog, FoodSnapshot } from '../nutrition/nutrition.model';
import { sessionErrors } from '../training/training-domain';
import { prescriptionType } from '../routines/routine-planning';
import type { TrainingSession } from '../training/training.model';
import { changes, same, type Difference } from './plan-exchange';
import { parseProgressFile, progressEnvelope, type ProgressFile, type WireFoodLog, type WireSession } from './progress-schema';
import { uuid } from './transfer-schema';

export type RecordKind = 'session' | 'food';
export type ProgressDecision = 'add' | 'keep' | 'replace';
export interface RecordReview {
  key: string; kind: RecordKind; date: LocalDate; label: string; revision: string;
  status: 'added' | 'already-present' | 'conflicting'; differences: Difference[];
  local: TrainingSession | FoodLog | null; incoming: TrainingSession | FoodLog;
}
export interface ProgressReview {
  file: ProgressFile; destination: UUID; mappingId: UUID | null; nativeSubject: boolean;
  ownerState: string; personState: string; sessionsState: string; logsState: string;
  records: RecordReview[];
}
const state = (value: unknown) => JSON.stringify(value);
function metrics(value: TrainingSession | FoodLog, kind: RecordKind): Record<string, unknown> {
  if (kind === 'food') {
    const log = value as FoodLog;
    return { date: log.date, mealLabel: log.mealLabel, food: log.food.name, grams: log.grams,
      kcalPer100g: log.food.per100g.kcal, proteinPer100g: log.food.per100g.protein,
      carbohydratePer100g: log.food.per100g.carbohydrate, fatPer100g: log.food.per100g.fat };
  }
  const session = value as TrainingSession;
  const fields: Record<string, unknown> = { date: session.date, version: session.version, durationMinutes: session.durationMinutes, notes: session.notes };
  for (const [exerciseIndex, item] of session.exercises.entries()) for (const [setIndex, set] of item.sets.entries()) {
    const key = `${item.exercise.name} · ejercicio ${exerciseIndex + 1} · serie ${setIndex + 1}`;
    fields[`${key} · estado`] = set.status;
    if (set.status === 'completed') {
      fields[`${key} · RPE`] = set.rpe;
      for (const [metric, amount] of Object.entries(set.actual)) fields[`${key} · ${metric}`] = amount;
    }
  }
  return fields;
}
const origin = (value: TrainingSession | FoodLog, file: ProgressFile) =>
  value.exchange?.workspaceId === file.sourcePerson.workspaceId && value.exchange.personId === file.sourcePerson.personId;
const revision = (row: WireSession | WireFoodLog, kind: RecordKind) => kind === 'session' ? String((row as WireSession).version) : row.updatedAt;

@Injectable({ providedIn: 'root' })
export class ProgressExchange {
  private readonly database = inject(Database);
  private assertOwner(settings: { mode: string | null; activePersonId: UUID | null; personalPersonId: UUID; workspaceId: UUID } | undefined,
    person: { archived?: boolean } | undefined, destination: UUID): void {
    if (!settings?.mode || settings.activePersonId !== destination || !person || person.archived ||
      (settings.mode === 'client' && settings.personalPersonId !== destination))
      throw new StorageFailure('invalid', 'Selecciona primero la persona destinataria activa.');
  }
  private wireExercise(value: ExerciseSnapshot, catalog: Map<string, CatalogExercise>) {
    if (value.catalogVersion !== null) {
      const entry = catalog.get(value.exerciseId);
      if (!entry || value.catalogVersion !== `1/${entry.source.revision}`) throw new Error('Falta la versión guardada del ejercicio en el catálogo local.');
      return { catalogId: entry.id, version: value.catalogVersion };
    }
    if (value.media !== null || !uuid.safeParse(value.exerciseId).success) throw new Error('No se puede compartir un ejercicio personalizado con medios no admitidos.');
    return { exerciseId: value.exerciseId, name: value.name, category: value.category, loggingType: value.loggingType,
      instruction: value.instruction, media: null, catalogVersion: null,
      ...('muscles' in value ? { muscles: value.muscles } : {}), ...('equipment' in value ? { equipment: value.equipment } : {}),
      ...('notes' in value ? { notes: value.notes } : {}) };
  }
  private wireFood(value: FoodSnapshot, catalog: Map<string, CatalogFood>) {
    if ('fdcId' in value.source) {
      const entry = catalog.get(value.foodId);
      if (!entry || entry.source.version !== value.source.version || entry.source.fdcId !== value.source.fdcId) throw new Error('Falta la versión guardada del alimento en el catálogo local.');
      return { catalogId: entry.id, version: value.source.version };
    }
    if (value.foodId !== value.source.customFoodId) throw new Error('El alimento personalizado tiene un origen incompatible.');
    return value;
  }
  private hydrateExercise(value: WireSession['exercises'][number]['exercise'], catalog: Map<string, CatalogExercise>): ExerciseSnapshot {
    if (!('catalogId' in value)) return structuredClone(value);
    const entry = catalog.get(value.catalogId);
    if (!entry || value.version !== `1/${entry.source.revision}`) throw new Error('Referencia de ejercicio fuera del catálogo local.');
    return exerciseSnapshot({ kind: 'catalog', id: entry.id, name: entry.name, entry });
  }
  private hydrateFood(value: WireFoodLog['food'], catalog: Map<string, CatalogFood>): FoodSnapshot {
    if (!('catalogId' in value)) return structuredClone(value);
    const entry = catalog.get(value.catalogId);
    if (!entry || value.version !== entry.source.version) throw new Error('Referencia de alimento fuera del catálogo local.');
    return foodSnapshot({ kind: 'usda', id: entry.id, name: entry.name, per100g: entry.per100g, entry });
  }
  async export(personId: UUID, from: LocalDate, through: LocalDate, exercises: CatalogExercise[], foods: CatalogFood[]): Promise<string> {
    const db = await this.database.open();
    const settings = await db.get('settings', 'workspace'), person = await db.get('people', personId);
    this.assertOwner(settings, person, personId);
    if (from !== localDate(from) || through !== localDate(through)) throw new Error('Indica fechas válidas.');
    const catalogExercises = new Map(exercises.map(item => [item.id, item]));
    const catalogFoods = new Map(foods.map(item => [item.id, item]));
    const [sessions, logs] = await Promise.all([
      db.getAllFromIndex('trainingSessions', 'by-person', personId), db.getAllFromIndex('foodLogs', 'by-person', personId),
    ]);
    const wireSessions = sessions.filter(row => row.status === 'completed' && row.date >= from && row.date <= through).map(row => {
      const { exchange: _exchange, personExerciseKeys: _keys, ...saved } = row;
      void _exchange; void _keys;
      return { ...saved, id: row.exchange?.recordId ?? row.id, personId,
        exercises: row.exercises.map(item => ({ ...item, exercise: this.wireExercise(item.exercise, catalogExercises) })) };
    });
    const wireLogs = logs.filter(row => row.date >= from && row.date <= through).map(row => {
      const { exchange: _exchange, ...saved } = row; void _exchange;
      return { ...saved, id: row.exchange?.recordId ?? row.id, personId, food: this.wireFood(row.food, catalogFoods) };
    });
    const file = progressEnvelope.parse({ app: 'entrena-con-jesus', schemaVersion: 1, kind: 'progress', exportId: newId(),
      exportedAt: new Date().toISOString(), sourcePerson: { workspaceId: settings!.workspaceId, personId, displayName: person!.displayName },
      from, through, payload: { sessions: wireSessions, foodLogs: wireLogs } });
    const text = JSON.stringify(file, null, 2);
    parseProgressFile(text);
    return text;
  }
  async review(text: string, destination: UUID, exercises: CatalogExercise[], foods: CatalogFood[]): Promise<ProgressReview> {
    const file = parseProgressFile(text);
    const exerciseCatalog = new Map(exercises.map(item => [item.id, item]));
    const foodCatalog = new Map(foods.map(item => [item.id, item]));
    const db = await this.database.open();
    const [settings, person, mappings, sessions, logs] = await Promise.all([
      db.get('settings', 'workspace'), db.get('people', destination),
      db.getAllFromIndex('externalSubjects', 'by-external', [file.sourcePerson.workspaceId, file.sourcePerson.personId]),
      db.getAllFromIndex('trainingSessions', 'by-person', destination), db.getAllFromIndex('foodLogs', 'by-person', destination),
    ]);
    this.assertOwner(settings, person, destination);
    if (settings!.workspaceId === file.sourcePerson.workspaceId && file.sourcePerson.personId !== destination)
      throw new StorageFailure('conflict', 'El archivo corresponde a otra persona de este mismo espacio.');
    if (mappings.length > 1 || mappings.some(item => item.personId !== destination))
      throw new StorageFailure('conflict', 'Esta identidad externa ya está vinculada a otra persona local.');
    const nativeSubject = settings!.workspaceId === file.sourcePerson.workspaceId;
    const records: RecordReview[] = [];
    const add = (kind: RecordKind, row: WireSession | WireFoodLog, incoming: TrainingSession | FoodLog, stored: (TrainingSession | FoodLog)[]) => {
        const matches = stored.filter(item => (origin(item, file) && item.exchange?.recordId === row.id) ||
          (nativeSubject && item.id === row.id && !item.exchange));
        if (matches.length > 1) throw new StorageFailure('conflict', 'Hay más de un registro local para el mismo origen.');
        const local = matches[0] ?? null;
        if (!local && nativeSubject && stored.some(item => item.id === row.id))
          throw new StorageFailure('conflict', 'El ID del registro ya pertenece a otro origen local.');
        const rev = revision(row, kind), fingerprint = state(row);
        const identical = !!local && (local.exchange ? local.exchange.revision === rev && local.exchange.fingerprint === fingerprint &&
          (kind === 'session' ? (local as TrainingSession).version === (local.exchange.localVersion ?? (row as WireSession).version) : local.updatedAt === row.updatedAt) &&
          same({ ...local, id: row.id, exchange: undefined, ...(kind === 'session' ? { version: (row as WireSession).version } : {}) }, incoming) :
          same(local, incoming));
        records.push({ key: `${kind}:${row.id}`, kind, date: row.date, label: kind === 'session' ? (incoming as TrainingSession).labels.day : (incoming as FoodLog).food.name,
          revision: rev, status: !local ? 'added' : identical ? 'already-present' : 'conflicting', local, incoming,
          differences: changes(local ? metrics(local, kind) : {}, metrics(incoming, kind), kind === 'session' ? 'Sesión' : 'Alimento') });
    };
    for (const row of file.payload.sessions) {
      const incoming: TrainingSession = { ...row, personId: destination,
        exercises: row.exercises.map(item => ({ ...item, exercise: this.hydrateExercise(item.exercise, exerciseCatalog) })),
        personExerciseKeys: [...new Set(row.exercises.map(item => `${destination}:${'catalogId' in item.exercise ? item.exercise.catalogId : item.exercise.exerciseId}`))] };
      if (sessionErrors(incoming).length || incoming.exercises.some(item => item.sets.some(set => set.prescribed && set.prescribed.type !== prescriptionType(item.exercise.loggingType))))
        throw new Error('La sesión real no es válida.');
      add('session', row, incoming, sessions);
    }
    for (const row of file.payload.foodLogs) add('food', row,
      { ...row, personId: destination, food: this.hydrateFood(row.food, foodCatalog) }, logs);
    return { file, destination, mappingId: mappings[0]?.id ?? null, nativeSubject,
      ownerState: state(settings), personState: state(person), sessionsState: state(sessions), logsState: state(logs), records };
  }
  async apply(review: ProgressReview, decisions: Record<string, ProgressDecision>): Promise<void> {
    const file = parseProgressFile(JSON.stringify(review.file));
    if (review.records.some(item => item.status === 'conflicting' && !['keep', 'replace'].includes(decisions[item.key])))
      throw new StorageFailure('invalid', 'Decide conservar o reemplazar cada registro en conflicto.');
    const tx = (await this.database.open()).transaction(['settings', 'people', 'externalSubjects', 'trainingSessions', 'foodLogs', 'drafts'], 'readwrite');
    try {
      const [settings, person, mappings, sessions, logs] = await Promise.all([
        tx.objectStore('settings').get('workspace'), tx.objectStore('people').get(review.destination),
        tx.objectStore('externalSubjects').index('by-external').getAll([file.sourcePerson.workspaceId, file.sourcePerson.personId]),
        tx.objectStore('trainingSessions').index('by-person').getAll(review.destination),
        tx.objectStore('foodLogs').index('by-person').getAll(review.destination),
      ]);
      this.assertOwner(settings, person, review.destination);
      if (settings!.workspaceId === file.sourcePerson.workspaceId && review.destination !== file.sourcePerson.personId ||
        state(settings) !== review.ownerState || state(person) !== review.personState ||
        mappings.length > 1 || mappings.some(item => item.personId !== review.destination) ||
        (mappings[0]?.id ?? null) !== review.mappingId || state(sessions) !== review.sessionsState || state(logs) !== review.logsState)
        throw new StorageFailure('conflict', 'La persona, el vínculo o sus registros cambiaron. Revisa el archivo otra vez.');
      for (const entry of review.records) {
        if (entry.status === 'already-present' || decisions[entry.key] === 'keep') continue;
        const row = entry.kind === 'session' ? file.payload.sessions.find(item => `session:${item.id}` === entry.key) :
          file.payload.foodLogs.find(item => `food:${item.id}` === entry.key);
        if (!row) throw new StorageFailure('invalid', 'Falta un registro revisado.');
        const saved = { ...structuredClone(entry.incoming), id: entry.local?.id ?? (review.nativeSubject ? row.id : newId()),
          exchange: { workspaceId: file.sourcePerson.workspaceId, personId: file.sourcePerson.personId,
            recordId: row.id, revision: entry.revision, fingerprint: state(row) } };
        if (entry.kind === 'session') {
          const session = saved as TrainingSession;
          // A replacement may follow a local correction; never decrease the local revision counter.
          session.version = Math.max(session.version, (entry.local as TrainingSession | null)?.version ?? 0);
          session.exchange!.localVersion = session.version;
          const draft = await tx.objectStore('drafts').index('by-editor').get([review.destination, `training:${session.id}`]);
          if (draft) throw new StorageFailure('conflict', 'Hay una corrección abierta para esta sesión. Termínala antes de reemplazar.');
          if (entry.local) await tx.objectStore('trainingSessions').put(session);
          else await tx.objectStore('trainingSessions').add(session);
        } else {
          const log = saved as FoodLog;
          const draft = await tx.objectStore('drafts').index('by-editor').get([review.destination, `food-diary:${log.date}`]);
          if (draft?.payload.kind === 'food-diary' && draft.payload.edit?.base.id === log.id)
            throw new StorageFailure('conflict', 'Hay una corrección abierta para este alimento. Termínala antes de reemplazar.');
          if (entry.local) await tx.objectStore('foodLogs').put(log);
          else await tx.objectStore('foodLogs').add(log);
        }
      }
      if (!mappings.length && !review.nativeSubject) {
        const now = new Date().toISOString();
        await tx.objectStore('externalSubjects').add({ id: newId(), personId: review.destination, createdAt: now, updatedAt: now,
          externalWorkspaceId: file.sourcePerson.workspaceId, externalPersonId: file.sourcePerson.personId });
      }
      await tx.done;
    } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await tx.done.catch(() => undefined); throw storageFailure(error); }
  }
}
