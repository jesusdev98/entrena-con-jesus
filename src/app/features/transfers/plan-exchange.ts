import { Injectable, inject } from '@angular/core';
import { newId, type UUID } from '../../core/domain/identity';
import { Database, StorageFailure, storageFailure } from '../../core/storage/database';
import { exerciseSnapshot } from '../exercises/exercise-catalog.model';
import { foodSnapshot } from '../nutrition/foods/food.model';
import { latestRevision } from '../routines/routines.repository';
import { latestPlan } from '../nutrition/meal-plans/meal-plans.repository';
import type { RoutineRevision, RoutineContent } from '../routines/routine.model';
import type { MealPlanRevision, MealPlanContent } from '../nutrition/nutrition.model';
import type { CustomExercise } from '../exercises/exercise.model';
import type { CustomFood } from '../nutrition/nutrition.model';
import type { CatalogExercise } from '../exercises/exercise-catalog.model';
import type { CatalogFood } from '../nutrition/foods/food.model';
import type { ExternalSubject, PlanOrigin } from './transfer.model';
import { parsePlanFile, planEnvelope, validateHydratedPlan, type PlanFile, type WirePlan } from './transfer-schema';

export type PlanKind = WirePlan['type'];
type Revision = RoutineRevision | MealPlanRevision;
export type Decision = 'accept' | 'keep' | 'copy';
export interface Difference { path: string; before: string; after: string }
export interface PlanReview {
  file: PlanFile; destination: UUID; kind: PlanKind; local: Revision | null; localPlanId: UUID | null;
  mappingId: UUID | null; nativeSubject: boolean; ownerState: string; personState: string;
  localState: string; differences: Difference[]; divergent: boolean; repeated: boolean;
  incomingContent: RoutineContent | MealPlanContent;
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
export const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const display = (value: unknown) => value === undefined ? '—' : JSON.stringify(value);
export function changes(before: unknown, after: unknown, path = 'Plan'): Difference[] {
  if (same(before, after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => changes((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], `${path}.${key}`));
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    return Array.from({ length: Math.max(before.length, after.length) }, (_, index) => changes(before[index], after[index], `${path}[${index + 1}]`)).flat();
  }
  return [{ path, before: display(before), after: display(after) }];
}
function originMatches(origin: PlanOrigin | undefined, subject: ExternalSubject, planId: UUID): boolean {
  return origin?.workspaceId === subject.workspaceId && origin.personId === subject.personId && origin.planId === planId;
}
function canonical(revision: Revision): UUID { return revision.exchange?.revisionId ?? revision.id; }
function ownerKey(value: unknown): string { return JSON.stringify(value); }

@Injectable({ providedIn: 'root' })
export class PlanExchange {
  private readonly db = inject(Database);
  private async catalog(exercises: CatalogExercise[], foods: CatalogFood[], plan: WirePlan): Promise<RoutineContent | MealPlanContent> {
    if (plan.type === 'routine') {
      const byId = new Map(exercises.map(entry => [entry.id, entry]));
      const content = structuredClone(plan.content);
      const hydrated: RoutineContent = { notes: content.notes, weeks: content.weeks.map(week => ({ id: week.id, name: week.name,
        days: week.days.map(day => ({ id: day.id, name: day.name, exercises: day.exercises.map(row => ({ id: row.id, notes: row.notes, sets: row.sets,
          exercise: 'catalogId' in row.exercise ? (() => {
            const entry = byId.get(row.exercise.catalogId);
            if (!entry || row.exercise.version !== `1/${entry.source.revision}`) throw new Error('Referencia de ejercicio fuera del catálogo local.');
            return exerciseSnapshot({ kind: 'catalog', id: entry.id, name: entry.name, entry });
          })() : row.exercise })) })) })) };
      validateHydratedPlan('routine', plan.name, hydrated);
      return hydrated;
    }
    const byId = new Map(foods.map(entry => [entry.id, entry]));
    const content = structuredClone(plan.content);
    const hydrated: MealPlanContent = { notes: content.notes, weeks: content.weeks.map(week => ({ id: week.id, name: week.name,
      days: week.days.map(day => ({ id: day.id, name: day.name, meals: day.meals.map(meal => ({ id: meal.id, name: meal.name,
        foods: meal.foods.map(row => ({ id: row.id, grams: row.grams, food: 'catalogId' in row.food ? (() => {
          const entry = byId.get(row.food.catalogId);
          if (!entry || row.food.version !== entry.source.version) throw new Error('Referencia de alimento fuera del catálogo local.');
          return foodSnapshot({ kind: 'usda', id: entry.id, name: entry.name, per100g: entry.per100g, entry });
        })() : row.food })) })) })) })) };
    validateHydratedPlan('meal-plan', plan.name, hydrated);
    return hydrated;
  }
  async export(personId: UUID, type: PlanKind, planId: UUID, exercises: CatalogExercise[], foods: CatalogFood[]): Promise<string> {
    const db = await this.db.open();
    const settings = await db.get('settings', 'workspace');
    const person = await db.get('people', personId);
    if (!settings?.mode || settings.activePersonId !== personId || !person || person.archived) throw new StorageFailure('invalid', 'Selecciona una persona activa antes de exportar.');
    const history = type === 'routine' ? await db.getAllFromIndex('routineRevisions', 'by-person', personId) : await db.getAllFromIndex('mealPlanRevisions', 'by-person', personId);
    const revision = type === 'routine' ? latestRevision(history as RoutineRevision[], planId) : latestPlan(history as MealPlanRevision[], planId);
    if (!revision || revision.archived) throw new StorageFailure('invalid', 'Selecciona un plan disponible.');
    const chain = history.filter(item => item.planId === planId);
    const inherited = chain.find(item => item.exchange)?.exchange;
    const subject: ExternalSubject = inherited ? { workspaceId: inherited.workspaceId, personId: inherited.personId, displayName: person.displayName }
      : { workspaceId: settings.workspaceId, personId, displayName: person.displayName };
    const parent = chain.find(item => item.id === revision.parentRevisionId);
    const customExercises: CustomExercise[] = [];
    const customFoods: CustomFood[] = [];
    const exerciseIds = new Set<string>(); const foodIds = new Set<string>();
    const exerciseMap = new Map(exercises.map(item => [item.id, item]));
    const foodMap = new Map(foods.map(item => [item.id, item]));
    let content: unknown;
    if (type === 'routine') {
      const source = revision as RoutineRevision;
      content = { notes: source.content.notes, weeks: source.content.weeks.map(week => ({ id: week.id, name: week.name,
        days: week.days.map(day => ({ id: day.id, name: day.name, exercises: day.exercises.map(row => {
          const snapshot = row.exercise;
          const catalog = exerciseMap.get(snapshot.exerciseId);
          if (snapshot.catalogVersion !== null && (!catalog || snapshot.catalogVersion !== `1/${catalog.source.revision}`)) throw new Error('El catálogo de ejercicios guardado no coincide con el disponible.');
          if (!catalog && snapshot.catalogVersion !== null) throw new Error('Falta un ejercicio del catálogo.');
          if (!catalog && snapshot.catalogVersion === null) exerciseIds.add(snapshot.exerciseId);
          return { id: row.id, notes: row.notes, sets: row.sets, exercise: catalog && snapshot.catalogVersion ? { catalogId: catalog.id, version: snapshot.catalogVersion } : snapshot };
        }) })) })) };
    } else {
      const source = revision as MealPlanRevision;
      content = { notes: source.content.notes, weeks: source.content.weeks.map(week => ({ id: week.id, name: week.name,
        days: week.days.map(day => ({ id: day.id, name: day.name, meals: day.meals.map(meal => ({ id: meal.id, name: meal.name,
          foods: meal.foods.map(row => {
            const catalog = foodMap.get(row.food.foodId);
            if ('fdcId' in row.food.source && (!catalog || row.food.source.version !== catalog.source.version)) throw new Error('El catálogo de alimentos guardado no coincide con el disponible.');
            if ('customFoodId' in row.food.source) foodIds.add(row.food.source.customFoodId);
            return { id: row.id, grams: row.grams, food: 'fdcId' in row.food.source ? { catalogId: row.food.foodId, version: row.food.source.version } : row.food };
          }) })) })) })) };
    }
    for (const id of exerciseIds) {
      const resource = await db.get('customExercises', [personId, id as UUID]);
      if (!resource) throw new Error('Falta un ejercicio personalizado necesario para compartir.');
      customExercises.push(resource);
    }
    for (const id of foodIds) {
      const resource = await db.get('customFoods', [personId, id as UUID]);
      if (!resource) throw new Error('Falta un alimento personalizado necesario para compartir.');
      customFoods.push(resource);
    }
    const wire = { type, planId: inherited?.planId ?? planId, revisionId: canonical(revision),
      parentRevisionId: revision.exchange?.parentRevisionId ?? (parent ? canonical(parent) : null), name: revision.name,
      archived: !!revision.archived, content };
    const file = planEnvelope.parse({ app: 'entrena-con-jesus', schemaVersion: 1, kind: 'plan', exportId: newId(), exportedAt: new Date().toISOString(),
      sourcePerson: subject, payload: { plans: [wire], customExercises, customFoods } });
    const text = JSON.stringify(file, null, 2);
    parsePlanFile(text);
    return text;
  }
  async review(text: string, destination: UUID, exercises: CatalogExercise[], foods: CatalogFood[]): Promise<PlanReview> {
    const file = parsePlanFile(text);
    const plan = file.payload.plans[0];
    const incomingContent = await this.catalog(exercises, foods, plan);
    const db = await this.db.open();
    const settings = await db.get('settings', 'workspace');
    const person = await db.get('people', destination);
    if (!settings?.mode || settings.activePersonId !== destination || !person || person.archived || (settings.mode === 'client' && settings.personalPersonId !== destination)) throw new StorageFailure('invalid', 'Selecciona primero la persona destinataria.');
    const subject = file.sourcePerson;
    if (settings.workspaceId === subject.workspaceId && destination !== subject.personId) throw new StorageFailure('conflict', 'El archivo procede de otra persona de este mismo espacio. Selecciónala para revisar.');
    const own = settings.workspaceId === subject.workspaceId && destination === subject.personId;
    const mappings = await db.getAllFromIndex('externalSubjects', 'by-external', [subject.workspaceId, subject.personId]);
    if (mappings.length > 1 || mappings.some(mapping => mapping.personId !== destination)) throw new StorageFailure('conflict', 'Esta identidad externa ya está asignada a otra persona local.');
    const history = plan.type === 'routine' ? await db.getAllFromIndex('routineRevisions', 'by-person', destination) : await db.getAllFromIndex('mealPlanRevisions', 'by-person', destination);
    const matches = history.filter(item => originMatches(item.exchange, subject, plan.planId) || (own && item.planId === plan.planId));
    const ids = [...new Set(matches.map(item => item.planId))];
    if (ids.length > 1) throw new StorageFailure('conflict', 'El plan externo tiene varias copias vinculadas.');
    const localPlanId = ids[0] ?? null;
    const local = localPlanId ? (plan.type === 'routine' ? latestRevision(history as RoutineRevision[], localPlanId) : latestPlan(history as MealPlanRevision[], localPlanId)) ?? null : null;
    const repeated = matches.some(item => (item.exchange?.revisionId ?? (own ? item.id : null)) === plan.revisionId);
    const previously = matches.find(item => item.exchange?.revisionId === plan.revisionId);
    if (previously?.exchange?.fingerprint !== undefined && previously.exchange.fingerprint !== JSON.stringify(plan)) throw new StorageFailure('conflict', 'Una revisión importada conserva el mismo ID pero contiene otros datos.');
    const localState = ownerKey(local);
    return { file, destination, kind: plan.type, local, localPlanId, mappingId: mappings[0]?.id ?? null, nativeSubject: own,
      ownerState: ownerKey(settings), personState: ownerKey(person), localState,
      differences: changes(local ? { name: local.name, archived: !!local.archived, content: local.content } : undefined,
        { name: plan.name, archived: plan.archived, content: incomingContent }),
      divergent: !!local && canonical(local) !== plan.parentRevisionId && !repeated, repeated, incomingContent };
  }
  async apply(review: PlanReview, decision: Decision): Promise<void> {
    const plan = review.file.payload.plans[0];
    const subject = review.file.sourcePerson;
    const tx = (await this.db.open()).transaction(['settings', 'people', 'externalSubjects', 'routineRevisions', 'mealPlanRevisions', 'customExercises', 'customFoods'], 'readwrite');
    try {
      const settings = await tx.objectStore('settings').get('workspace');
      const person = await tx.objectStore('people').get(review.destination);
      if (!settings?.mode || settings.activePersonId !== review.destination || !person || person.archived || (settings.mode === 'client' && settings.personalPersonId !== review.destination) || ownerKey(settings) !== review.ownerState || ownerKey(person) !== review.personState) throw new StorageFailure('conflict', 'La persona activa cambió. Vuelve a revisar el archivo.');
      if (settings.workspaceId === subject.workspaceId && review.destination !== subject.personId) throw new StorageFailure('conflict', 'El archivo corresponde a otra persona de este espacio.');
      const mappings = await tx.objectStore('externalSubjects').index('by-external').getAll([subject.workspaceId, subject.personId]);
      if (mappings.length > 1 || mappings.some(item => item.personId !== review.destination) || (mappings[0]?.id ?? null) !== review.mappingId) throw new StorageFailure('conflict', 'La asignación externa cambió. Vuelve a revisar el archivo.');
      const store = tx.objectStore(plan.type === 'routine' ? 'routineRevisions' : 'mealPlanRevisions');
      const history = await store.index('by-person').getAll(review.destination);
      const current = review.localPlanId ? (plan.type === 'routine' ? latestRevision(history as RoutineRevision[], review.localPlanId) : latestPlan(history as MealPlanRevision[], review.localPlanId)) : null;
      if (ownerKey(current ?? null) !== review.localState || (!review.localPlanId && history.some(item => originMatches(item.exchange, subject, plan.planId) ||
        (settings.workspaceId === subject.workspaceId && review.destination === subject.personId && item.planId === plan.planId)))) throw new StorageFailure('conflict', 'El plan local cambió. Revisa las diferencias de nuevo.');
      if (review.repeated) {
        // A reviewed duplicate is a no-op even if its export ID changed.
      } else if (decision !== 'keep') {
        const planId = decision === 'copy' || !review.localPlanId ? newId() : review.localPlanId;
        const parentRevisionId = decision === 'copy' ? null : current?.id ?? null;
        const now = new Date().toISOString();
        const exchange: PlanOrigin | undefined = decision === 'copy' ? undefined : { workspaceId: subject.workspaceId, personId: subject.personId,
          planId: plan.planId, revisionId: plan.revisionId, parentRevisionId: plan.parentRevisionId, fingerprint: JSON.stringify(plan) };
        const revision = { id: newId(), personId: review.destination, planId, parentRevisionId, name: plan.name,
          content: structuredClone(review.incomingContent), archived: plan.archived, createdAt: now, updatedAt: now, ...(exchange ? { exchange } : {}) };
        for (const resource of review.file.payload.customExercises) {
          const stored = await tx.objectStore('customExercises').get([review.destination, resource.id]);
          if (!stored) await tx.objectStore('customExercises').add({ ...resource, personId: review.destination });
          else if (!same({ ...stored, personId: resource.personId }, resource)) throw new StorageFailure('conflict', 'Un ejercicio personalizado tiene el mismo ID y otros datos.');
        }
        for (const resource of review.file.payload.customFoods) {
          const stored = await tx.objectStore('customFoods').get([review.destination, resource.id]);
          if (!stored) await tx.objectStore('customFoods').add({ ...resource, personId: review.destination });
          else if (!same({ ...stored, personId: resource.personId }, resource)) throw new StorageFailure('conflict', 'Un alimento personalizado tiene el mismo ID y otros datos.');
        }
        if (plan.type === 'routine') await tx.objectStore('routineRevisions').add(revision as RoutineRevision);
        else await tx.objectStore('mealPlanRevisions').add(revision as MealPlanRevision);
      }
      if (!mappings.length && !(settings.workspaceId === subject.workspaceId && review.destination === subject.personId)) {
        const now = new Date().toISOString();
        await tx.objectStore('externalSubjects').add({ id: newId(), personId: review.destination, createdAt: now, updatedAt: now,
          externalWorkspaceId: subject.workspaceId, externalPersonId: subject.personId });
      }
      await tx.done;
    } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await tx.done.catch(() => undefined); throw storageFailure(error); }
  }
}
