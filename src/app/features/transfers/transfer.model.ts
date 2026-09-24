import type { OwnedRecord, UUID } from '../../core/domain/identity';
import type { AppDatabase } from '../../core/storage/database-schema';
import type { StoreNames } from 'idb';
import type { PlanFile } from './transfer-schema';
import type { ProgressFile } from './progress-schema';
import type { BackupFile } from './backup-schema';

export interface ExternalSubject { workspaceId: UUID; personId: UUID; displayName: string }
export interface ExternalSubjectMapping extends OwnedRecord { externalWorkspaceId: UUID; externalPersonId: UUID }
/** Foreign plan identity is separate from this browser's append-only revision identity. */
export interface PlanOrigin { workspaceId: UUID; personId: UUID; planId: UUID; revisionId: UUID; parentRevisionId: UUID | null; fingerprint: string }
/** The imported foreign record ID stays distinct from the recipient's local store key. */
export interface ProgressOrigin { workspaceId: UUID; personId: UUID; recordId: UUID; revision: string; fingerprint: string; localVersion?: number }
export type PlanPayload = PlanFile['payload'];
export type ProgressPayload = ProgressFile['payload'];
export type BackupPayload = { [Store in StoreNames<AppDatabase>]: AppDatabase[Store]['value'][] };
export type TransferEnvelope = PlanFile | ProgressFile | BackupFile;
