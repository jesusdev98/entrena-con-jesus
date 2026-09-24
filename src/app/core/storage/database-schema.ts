import type { DBSchema, StoreNames } from 'idb';
import type { LocalDate, UUID } from '../domain/identity';
import type { AppSettings, Person, ProfileRevision } from '../../features/people/person.model';
import type { CustomExercise } from '../../features/exercises/exercise.model';
import type { RoutineRevision } from '../../features/routines/routine.model';
import type { TrainingSession } from '../../features/training/training.model';
import type { CustomFood, FoodLog, MealConsumption, MealPlanRevision } from '../../features/nutrition/nutrition.model';
import type { DailySnapshot } from '../../features/activity/activity.model';
import type { ExternalSubjectMapping } from '../../features/transfers/transfer.model';
import type { Draft } from './draft.model';

interface OwnedStore<T> { key: [UUID, UUID]; value: T; indexes: { 'by-person': UUID } }
interface DatedStore<T> extends OwnedStore<T> { indexes: { 'by-person': UUID; 'by-person-date': [UUID, LocalDate] } }
export interface AppDatabase extends DBSchema {
  settings: { key: 'workspace'; value: AppSettings };
  people: { key: UUID; value: Person; indexes: { 'by-kind': Person['kind'] } };
  profileRevisions: OwnedStore<ProfileRevision>;
  customExercises: OwnedStore<CustomExercise>;
  customFoods: OwnedStore<CustomFood>;
  routineRevisions: OwnedStore<RoutineRevision>;
  mealPlanRevisions: OwnedStore<MealPlanRevision>;
  trainingSessions: DatedStore<TrainingSession> & { indexes: { 'by-person-exercise': string } };
  foodLogs: DatedStore<FoodLog>;
  dailySnapshots: DatedStore<DailySnapshot>;
  mealConsumptions: DatedStore<MealConsumption> & { indexes: { 'by-source': [UUID, LocalDate, UUID, UUID] } };
  drafts: OwnedStore<Draft> & { indexes: { 'by-editor': [UUID, string] } };
  externalSubjects: OwnedStore<ExternalSubjectMapping> & { indexes: { 'by-external': [UUID, UUID] } };
}
export type OwnedStoreName = Exclude<StoreNames<AppDatabase>, 'settings' | 'people'>;
