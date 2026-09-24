import type { OwnedRecord } from '../../core/domain/identity';

export type ExerciseCategory = 'strength' | 'cardio' | 'stretching' | 'mobility' | 'other';
export type CustomLoggingType = 'weight_reps' | 'bodyweight_reps' | 'assisted_bodyweight' | 'duration' | 'distance_duration';
/** Keep catalog and previously stored logging identifiers readable. */
export type LoggingType = CustomLoggingType | 'weight-reps' | 'bodyweight-reps' | 'assisted-reps' | 'distance-duration';
export interface AssetCredit {
  sourceUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  changes: string;
}
export interface ExerciseAttribution {
  creator: string;
  creatorUrl: string;
  license: string;
  licenseUrl: string;
  source?: { name: string; url: string; license: string; licenseUrl: string; changes: string };
}
export interface ExerciseFrame {
  path: string;
  frame: number;
  label: string;
  sha256: string;
  attribution: ExerciseAttribution & {
    sourceUrl: string;
    collectionCredit: { author: string; url: string; license: string; licenseUrl: string; scope: string };
    localChanges: string;
  };
}
export interface ReviewedExerciseMedia {
  mode: 'movement' | 'cycle' | 'hold';
  semantics: 'position-pair' | 'partial-sequence' | 'static-references' | 'setup-to-hold';
  description: string;
  frames: [ExerciseFrame, ExerciseFrame];
  review: { sourcePosition: number; evidence: string; sheet: string; note: string };
}
/** Retained for stored pre-catalog snapshots; new snapshots use ordered reviewed media. */
export interface LegacyExerciseMedia { startAssetId: string; finishAssetId: string; credit: AssetCredit }
export interface ExerciseSnapshot {
  exerciseId: string;
  name: string;
  category: ExerciseCategory;
  loggingType: LoggingType;
  instruction: string;
  media: ReviewedExerciseMedia | LegacyExerciseMedia | null;
  catalogVersion: string | null;
  muscles?: string[];
  equipment?: string[];
  notes?: string;
  source?: { revision: string; originalName: string; originalEquipment: string; attribution: ExerciseAttribution };
}
export interface CustomExercise extends OwnedRecord {
  name: string;
  category: ExerciseCategory;
  loggingType: LoggingType;
  instruction: string;
  notes?: string;
  equipment?: string[];
  archived?: boolean;
}
export interface CustomExerciseFormValue {
  name: string;
  category: ExerciseCategory | '';
  loggingType: LoggingType | '';
  instruction: string;
  notes: string;
  equipment?: string;
}
