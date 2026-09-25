import { Injectable, inject } from '@angular/core';
import { type LocalDate, type UUID } from '../../core/domain/identity';
import { Database } from '../../core/storage/database';
import type { DailySnapshot } from '../activity/activity.model';
import type { FoodLog } from '../nutrition/nutrition.model';
import type { TrainingSession } from '../training/training.model';

export interface ProgressData { sessions: TrainingSession[]; logs: FoodLog[]; snapshots: DailySnapshot[] }

@Injectable({ providedIn: 'root' })
export class ProgressDataRepository {
  private readonly database = inject(Database);
  async read(owner: UUID, start: LocalDate, end: LocalDate): Promise<ProgressData> {
    const db = await this.database.open();
    const tx = db.transaction(['trainingSessions', 'foodLogs', 'dailySnapshots'], 'readonly');
    const range = IDBKeyRange.bound([owner, start], [owner, end]);
    const [sessions, logs, snapshots] = await Promise.all([
      tx.objectStore('trainingSessions').index('by-person-date').getAll(range),
      tx.objectStore('foodLogs').index('by-person-date').getAll(range),
      tx.objectStore('dailySnapshots').index('by-person-date').getAll(range),
    ]);
    await tx.done;
    return { sessions, logs, snapshots };
  }
}
