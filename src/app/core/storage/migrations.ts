import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { AppDatabase } from './database-schema';

export const DATABASE_VERSION = 2;

export function migrateDatabase(db: IDBPDatabase<AppDatabase>, oldVersion: number,
  transaction: IDBPTransaction<AppDatabase, StoreNames<AppDatabase>[], 'versionchange'>): void {
  if (oldVersion >= 1 && ['settings', 'people', 'profileRevisions', 'drafts'].some(name => !db.objectStoreNames.contains(name as StoreNames<AppDatabase>))) {
    transaction.abort();
    return;
  }
  if (oldVersion < 1) {
    db.createObjectStore('settings', { keyPath: 'id' });
    db.createObjectStore('people', { keyPath: 'id' }).createIndex('by-kind', 'kind');
    db.createObjectStore('profileRevisions', { keyPath: ['personId', 'id'] }).createIndex('by-person', 'personId');
    const drafts = db.createObjectStore('drafts', { keyPath: ['personId', 'id'] });
    drafts.createIndex('by-person', 'personId');
    drafts.createIndex('by-editor', ['personId', 'editorKey'], { unique: true });
  }
  if (oldVersion < 2) {
    for (const name of ['customExercises', 'customFoods', 'routineRevisions', 'mealPlanRevisions', 'externalSubjects'] as const) {
      db.createObjectStore(name, { keyPath: ['personId', 'id'] }).createIndex('by-person', 'personId');
    }
    for (const name of ['trainingSessions', 'foodLogs', 'dailySnapshots', 'mealConsumptions'] as const) {
      const store = db.createObjectStore(name, { keyPath: ['personId', 'id'] });
      store.createIndex('by-person', 'personId');
      store.createIndex('by-person-date', ['personId', 'date'], { unique: name === 'dailySnapshots' });
    }
    transaction.objectStore('trainingSessions').createIndex('by-person-exercise', 'personExerciseKeys', { multiEntry: true });
    transaction.objectStore('mealConsumptions').createIndex('by-source', ['personId', 'date', 'revisionId', 'mealId'], { unique: true });
    transaction.objectStore('externalSubjects').createIndex('by-external', ['externalWorkspaceId', 'externalPersonId'], { unique: true });
  }
}
