import type { Instant, OwnedRecord, UUID } from '../../core/domain/identity';

export type AppMode = 'trainer' | 'client';
export interface MacroPercentages { protein: number; carbohydrate: number; fat: number }
export interface ActivityAssumptions {
  totalSteps: number | null;
  workMinutes: number | null;
  workActivityCode: string | null;
  workSteps: number | null;
  trainingMinutes: number | null;
  trainingActivityCode: string | null;
  trainingSteps: number | null;
  walkingCadence: number;
}
export interface PersonProfile {
  age: number | null;
  formulaSex: 'male' | 'female' | null;
  heightCm: number | null;
  weightKg: number | null;
  goal: 'loss' | 'maintenance' | 'gain';
  adjustmentKcal: number;
  macros: MacroPercentages;
  usualActivity: ActivityAssumptions;
}
export interface Person {
  readonly id: UUID;
  kind: 'personal' | 'client';
  displayName: string;
  reference: string;
  archived: boolean;
  profile: PersonProfile;
  readonly createdAt: Instant;
  updatedAt: Instant;
}
export interface ProfileRevision extends OwnedRecord { readonly profile: PersonProfile }
export interface DemoRecordIdentity { id: UUID; createdAt: Instant }
export interface DemoSeedReceipt {
  personId: UUID;
  trainerPersonId: UUID | null;
  trainerPersonCreatedAt: Instant | null;
  profileRevision: DemoRecordIdentity;
  routine: { planId: UUID; revision: DemoRecordIdentity };
  mealPlan: { planId: UUID; revision: DemoRecordIdentity };
  sessions: DemoRecordIdentity[];
  foodLogs: DemoRecordIdentity[];
  snapshots: DemoRecordIdentity[];
}
export interface AppSettings {
  id: 'workspace';
  workspaceId: UUID;
  mode: AppMode | null;
  personalPersonId: UUID;
  activePersonId: UUID;
  lastTrainerPersonId: UUID;
  /** Set at virgin database bootstrap; absence never implies eligibility. */
  demoSeed?: { version: 1; status: 'eligible' | 'seeded' | 'ineligible' | 'cleared'; receipt?: DemoSeedReceipt };
}
export interface PersonFormValue {
  displayName: string;
  reference: string;
  profile: PersonProfile;
}
export function emptyProfile(): PersonProfile {
  return {
    age: null, formulaSex: null, heightCm: null, weightKg: null,
    goal: 'maintenance', adjustmentKcal: 0,
    macros: { protein: 25, carbohydrate: 50, fat: 25 },
    usualActivity: {
      totalSteps: null, workMinutes: null, workActivityCode: null, workSteps: null,
      trainingMinutes: null, trainingActivityCode: null, trainingSteps: null, walkingCadence: 100,
    },
  };
}
