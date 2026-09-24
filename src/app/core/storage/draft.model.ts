import type { OwnedRecord, UUID } from '../domain/identity';
import type { PersonFormValue } from '../../features/people/person.model';
import type { RoutineContentDraft } from '../../features/routines/routine.model';
import type { CustomFoodFormValue } from '../../features/nutrition/nutrition.model';
import type { MealPlanContentDraft } from '../../features/nutrition/meal-plans/meal-planning';
import type { TrainingSession } from '../../features/training/training.model';
import type { DailyActivityInput } from '../../features/activity/activity.model';
import type { CustomExerciseFormValue } from '../../features/exercises/exercise.model';
import type { ActivityDraftPayload } from '../../features/activity/daily-target.model';
import type { FoodLog, FoodSnapshot } from '../../features/nutrition/nutrition.model';
import type { LocalDate } from '../domain/identity';

export type DraftPayload =
  | ActivityDraftPayload
  | { kind: 'custom-exercise'; exerciseId: UUID; value: CustomExerciseFormValue; baseUpdatedAt: string | null }
  | { kind: 'custom-food'; foodId: UUID; value: CustomFoodFormValue; baseUpdatedAt: string | null }
  | { kind: 'person'; subjectId: UUID; value: PersonFormValue; baseUpdatedAt: string | null }
  | { kind: 'routine'; planId: UUID; baseRevisionId: UUID | null; name: string; content: RoutineContentDraft }
  | { kind: 'meal-plan'; planId: UUID; baseRevisionId: UUID | null; name: string; content: MealPlanContentDraft }
  | { kind: 'food-diary'; date: LocalDate; food: FoodSnapshot | null; grams: number | null; mealLabel: string;
      edit?: { base: FoodLog; grams: number | null; mealLabel: string } | null }
  | { kind: 'training'; session: TrainingSession; baseSession: TrainingSession | null }
  | { kind: 'activity'; input: DailyActivityInput };
export interface Draft extends OwnedRecord { editorKey: string; payload: DraftPayload }
