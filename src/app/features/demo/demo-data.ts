import { localDate, newId, type LocalDate } from '../../core/domain/identity';
import { mondayOf } from '../nutrition/diary/diary.model';
import { parseExerciseCatalog, catalogChoice as exerciseChoice, exerciseSnapshot, type CatalogExercise } from '../exercises/exercise-catalog.model';
import { parseFoodCatalog, catalogChoice as foodChoice, type CatalogFood } from '../nutrition/foods/food.model';
import { foodSnapshot } from '../nutrition/foods/food.model';
import { savedContent as routineContent } from '../routines/routine-planning';
import { savedContent as mealContent } from '../nutrition/meal-plans/meal-planning';
import { startSession, completeSet, sessionErrors } from '../training/training-domain';
import { capturedContext, calculateActivity, initialActivity, type DailyTargetSnapshot } from '../activity/daily-target.model';
import { parseMetCatalog, type MetCatalog } from '../activity/met-catalog';
import type { Person, ProfileRevision } from '../people/person.model';
import type { RoutineRevision } from '../routines/routine.model';
import type { MealPlanRevision, FoodLog } from '../nutrition/nutrition.model';
import type { TrainingSession } from '../training/training.model';
import { validateBackup } from '../transfers/backup-schema';
import type { BackupPayload } from '../transfers/transfer.model';

export interface DemoCatalogs { exercises: CatalogExercise[]; foods: CatalogFood[]; mets: MetCatalog }

/** Fetch complete, published catalogs before any IndexedDB write transaction. */
export async function loadDemoCatalogs(): Promise<DemoCatalogs> {
  const paths = ['catalogs/exercises.es.json', 'catalogs/foods.es.json', 'catalogs/activity-mets.json'];
  const values = await Promise.all(paths.map(async path => {
    const response = await fetch(new URL(path, document.baseURI));
    if (!response.ok) throw new Error(`Catalog unavailable: ${path}`);
    return response.json() as Promise<unknown>;
  }));
  return { exercises: parseExerciseCatalog(values[0]), foods: parseFoodCatalog(values[1]), mets: parseMetCatalog(values[2]) };
}

function instant(date: LocalDate, hour = 12): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, hour).toISOString();
}
function offset(monday: LocalDate, days: number): LocalDate {
  const date = new Date(`${monday}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return localDate(date.toISOString().slice(0, 10));
}
function exercise(catalog: CatalogExercise[], id: string) {
  const found = catalog.find(item => item.id === id);
  if (!found || found.loggingType !== 'weight-reps') throw new Error(`Published exercise unavailable: ${id}`);
  return exerciseSnapshot(exerciseChoice(found));
}
function food(catalog: CatalogFood[], name: RegExp) {
  const found = catalog.find(item => name.test(item.name));
  if (!found) throw new Error(`Published USDA food unavailable: ${name.source}`);
  return foodSnapshot(foodChoice(found));
}

export interface DemoData {
  profileRevision: ProfileRevision;
  routine: RoutineRevision;
  mealPlan: MealPlanRevision;
  sessions: TrainingSession[];
  foodLogs: FoodLog[];
  snapshots: DailyTargetSnapshot[];
}

export function buildDemoData(person: Person, catalogs: DemoCatalogs, today: LocalDate): DemoData {
  const owner = person.id, createdAt = new Date().toISOString();
  const profileRevision: ProfileRevision = { id: newId(), personId: owner, createdAt, updatedAt: createdAt, profile: structuredClone(person.profile) };
  const bench = exercise(catalogs.exercises, 'exercise-bench-press');
  const row = exercise(catalogs.exercises, 'exercise-machine-row');
  const press = exercise(catalogs.exercises, 'exercise-standing-dumbbell-press');
  const squat = exercise(catalogs.exercises, 'exercise-leg-press');
  const hinge = exercise(catalogs.exercises, 'exercise-romanian-deadlift');
  const curl = exercise(catalogs.exercises, 'exercise-seated-leg-curl');
  const makeDay = (name: string, movements: typeof bench[]) => ({ id: newId(), name, exercises: movements.map((movement, index) => ({
    id: newId(), exercise: movement, notes: '', sets: Array.from({ length: 3 }, () => ({ id: newId(), type: 'weight-reps' as const,
      reps: { minimum: index === 0 ? 6 : 8, maximum: index === 0 ? 10 : 12 }, restSeconds: index === 0 ? 150 : 90,
      weightKg: index === 0 ? 50 : 30, targetRir: 2, notes: '' })) })) });
  const routineName = 'Demo · Rutina superior e inferior';
  const routine: RoutineRevision = { id: newId(), personId: owner, planId: newId(), parentRevisionId: null,
    name: routineName, createdAt, updatedAt: createdAt,
    content: routineContent(routineName, { notes: 'Demo · Cuatro días; las cargas reales están en el historial.', weeks: [
      { id: newId(), name: 'Semana de prueba', days: [makeDay('Lunes · Superior A', [bench, row, press]),
        makeDay('Martes · Inferior A', [squat, hinge, curl]), makeDay('Jueves · Superior B', [bench, press, row]),
        makeDay('Viernes · Inferior B', [hinge, squat, curl])] },
    ] }) };

  const oats = food(catalogs.foods, /avena/i), milk = food(catalogs.foods, /leche/i);
  const rice = food(catalogs.foods, /arroz/i), chicken = food(catalogs.foods, /pollo/i);
  const yogurt = food(catalogs.foods, /yogur/i), banana = food(catalogs.foods, /plátano|banana/i);
  const eggs = food(catalogs.foods, /huev/i), bread = food(catalogs.foods, /pan /i);
  const groups = [
    { name: 'Desayuno', portions: [[oats, 85], [milk, 250]] as const },
    { name: 'Comida', portions: [[rice, 200], [chicken, 180]] as const },
    { name: 'Merienda', portions: [[yogurt, 220], [banana, 130]] as const },
    { name: 'Cena', portions: [[eggs, 160], [bread, 110]] as const },
  ];
  const mealName = 'Plan de alimentación de prueba';
  const mealPlan: MealPlanRevision = { id: newId(), personId: owner, planId: newId(), parentRevisionId: null,
    name: mealName, createdAt, updatedAt: createdAt,
    content: mealContent(mealName, { notes: 'Demo · Porciones orientativas; los registros reales son independientes.', weeks: [{
      id: newId(), name: 'Semana de prueba', days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(name => ({
        id: newId(), name, meals: groups.map(group => ({ id: newId(), name: group.name,
          foods: group.portions.map(([item, grams]) => ({ id: newId(), food: item, grams })) })) })) }] }) };

  // Six fully elapsed Monday–Sunday weeks, alternating 3 and 4 sessions.
  const firstMonday = offset(mondayOf(today), -42);
  const sessions: TrainingSession[] = [];
  for (let week = 0; week < 6; week++) {
    for (const dayIndex of (week % 2 === 0 ? [0, 1, 2] : [0, 1, 2, 3])) {
      const day = routine.content.weeks[0].days[dayIndex];
      const date = offset(firstMonday, week * 7 + [0, 1, 3, 4][dayIndex]);
      const startedAt = instant(date, 12), completedAt = instant(date, 13);
      const started = startSession(routine, routine.content.weeks[0].id, day.id, date, startedAt);
      const exercises = started.exercises.map((movement, exerciseIndex) => ({ ...movement,
        sets: movement.sets.map((set, setIndex) => completeSet({ id: set.id, prescribed: set.prescribed, status: 'draft',
          actual: { type: 'weight-reps', weightKg: movement.exercise.exerciseId === bench.exerciseId ? 50 + Math.floor(week / 2) * 2.5
            : movement.exercise.exerciseId === squat.exerciseId ? 85 + week * 2.5 : 25 + exerciseIndex * 7.5 + week * 1.25,
          reps: 8 + (setIndex % 2), rir: 2 - (setIndex % 2) }, rpe: 7.5 + (setIndex % 2) }, 'weight-reps', completedAt)) }));
      const session: TrainingSession = { ...started, updatedAt: completedAt, status: 'completed', completedAt,
        version: 1, durationMinutes: 55 + dayIndex * 5, durationSource: 'manual', exercises };
      if (sessionErrors(session).length) throw new Error(sessionErrors(session).join('\n'));
      sessions.push(session);
    }
  }

  const foodLogs: FoodLog[] = [], snapshots: DailyTargetSnapshot[] = [];
  const context = capturedContext(profileRevision, catalogs.mets);
  const estimated = person.profile.age !== null && person.profile.age >= 19 && person.profile.formulaSex !== null &&
    person.profile.heightCm !== null && person.profile.weightKg !== null;
  const metTable = person.profile.age !== null && person.profile.age >= 60 ? 'older-adult' : 'adult';
  const workMet = catalogs.mets.entries.find(item => item.table === metTable && item.category === 'work');
  const trainingMet = catalogs.mets.entries.find(item => item.table === metTable && item.category === 'resistance');
  if (estimated && (!workMet || !trainingMet)) throw new Error('Published MET activities unavailable');
  for (let week = 0; week < 6; week++) for (const dayIndex of [0, 3]) {
    const date = offset(firstMonday, week * 7 + dayIndex), recordedAt = instant(date, 15);
    const variation = (week + dayIndex) % 3 === 0 ? 0.7 : (week + dayIndex) % 3 === 1 ? 1 : 1.24;
    for (const group of groups) for (const [item, grams] of group.portions) {
      foodLogs.push({ id: newId(), personId: owner, createdAt: recordedAt, updatedAt: recordedAt, date,
        mealLabel: group.name, food: structuredClone(item), grams: Math.round(grams * variation), source: null });
    }
    const session = sessions.find(item => item.date === date);
    const value = initialActivity(person.profile);
    value.totalSteps = { actual: 6000 + (week * 617 + dayIndex * 733) % 4000 };
    if (estimated) {
      value.work = { actual: { includedSteps: 1200, blocks: [{ id: newId(), minutes: 240,
        expenditure: { mode: 'met', activityId: workMet!.id } }] } };
      value.training = { actual: { includedSteps: 0, blocks: session ? [{ id: newId(), minutes: session.durationMinutes!,
        linkedTrainingSessionId: session.id, expenditure: { mode: 'met', activityId: trainingMet!.id } }] : [] } };
      value.walking = { forecast: { mode: 'cadence', stepsPerMinute: 100,
        ...(metTable === 'older-adult' ? { activityId: catalogs.mets.entries.find(item => item.table === metTable && item.category === 'walking')?.id } : {}) } };
    } else {
      // A manual full-day demo target never fabricates missing anthropometrics or MET expenditure.
      value.mode = 'manual-tdee'; value.manualKcal = 2100;
      value.manualReason = 'Demo · Objetivo manual ilustrativo, no calculado a partir de tu perfil.';
      value.work = { actual: { includedSteps: 0, blocks: [] } };
      value.training = { actual: { includedSteps: 0, blocks: [] } };
    }
    const calculation = calculateActivity(value, context);
    snapshots.push({ id: newId(), personId: owner, createdAt: recordedAt, updatedAt: recordedAt,
      schemaVersion: 2, version: 1, date, context: structuredClone(context), activity: value, calculation });
  }
  return { profileRevision, routine, mealPlan, sessions, foodLogs, snapshots };
}

/** Exercise the same strict export validator against the entire candidate payload before writes. */
export function validateDemoPayload(payload: BackupPayload): void { validateBackup(payload); }
