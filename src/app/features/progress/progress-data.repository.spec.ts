import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { localDate, newId } from '../../core/domain/identity';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { performed, sessionFixture } from '../training/training.fixtures';
import { ProgressDataRepository } from './progress-data.repository';

const databases: Database[] = [];
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await deleteDB(db.name); } });

describe('person/date-scoped progress read', () => {
  it('reads one bounded index range per store in one transaction without mixing another person or date', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `progress-${newId()}` }] });
    const db = TestBed.inject(Database); databases.push(db);
    const repository = TestBed.inject(ProgressDataRepository), connection = await db.open();
    const owner = newId(), other = newId();
    const session = { ...performed(sessionFixture(owner)), date: localDate('2026-01-01'), status: 'completed' as const };
    const log = { id: newId(), personId: owner, date: localDate('2026-01-02'), createdAt: session.startedAt, updatedAt: session.startedAt,
      mealLabel: 'Comida', food: { foodId: 'sample', name: 'Food', source: { fdcId: '1', version: '1' },
        per100g: { kcal: 100, protein: 2, carbohydrate: 3, fat: 4 } }, grams: 100, source: null };
    const snapshot = { id: newId(), personId: owner, date: localDate('2026-01-03'), createdAt: session.startedAt, updatedAt: session.startedAt };
    await connection.put('trainingSessions', session);
    await connection.put('trainingSessions', { ...session, id: newId(), personId: other });
    await connection.put('trainingSessions', { ...session, id: newId(), date: localDate('2026-01-04') });
    await connection.put('foodLogs', log);
    await connection.put('foodLogs', { ...log, id: newId(), personId: other });
    // The range query remains format-agnostic; the pure aggregator rejects legacy snapshots.
    await connection.put('dailySnapshots', snapshot as never);
    await connection.put('dailySnapshots', { ...snapshot, id: newId(), personId: other } as never);
    const result = await repository.read(owner, localDate('2026-01-01'), localDate('2026-01-03'));
    expect(result.sessions.map(row => row.id)).toEqual([session.id]);
    expect(result.logs.map(row => row.id)).toEqual([log.id]);
    expect(result.snapshots.map(row => row.id)).toEqual([snapshot.id]);
    expect(await repository.read(other, localDate('2026-01-02'), localDate('2026-01-02'))).toMatchObject({ sessions: [], snapshots: [] });
  });
});
