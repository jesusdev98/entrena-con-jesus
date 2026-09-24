import { TestBed } from '@angular/core/testing';
import { deleteDB, openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME, StorageFailure, storageFailure } from './database';
import { OwnedRepository } from './owned.repository';
import { DraftsRepository } from './drafts.repository';
import { PeopleRepository } from '../../features/people/people.repository';
import { WorkspaceStore } from '../../features/people/workspace.store';
import { emptyProfile, type PersonFormValue } from '../../features/people/person.model';
import { localDate, newId, type UUID } from '../domain/identity';
import type { Draft } from './draft.model';
import type { FoodLog } from '../../features/nutrition/nutrition.model';
import type { AppDatabase } from './database-schema';

describe('local workspace persistence', () => {
  let database: Database;
  let people: PeopleRepository;
  let drafts: DraftsRepository;
  let store: WorkspaceStore;
  let personalId: UUID;

  const personValue = (name = 'Alex'): PersonFormValue => ({ displayName: name, reference: '', profile: emptyProfile() });
  const draftFor = (owner: UUID, subjectId: UUID): Draft => {
    const now = new Date().toISOString();
    return { id: newId(), personId: owner, editorKey: `person:${subjectId}`, createdAt: now, updatedAt: now,
      payload: { kind: 'person', subjectId, value: personValue(), baseUpdatedAt: null } };
  };
  const foodLog = (personId: UUID, id = newId()): FoodLog => ({
    id, personId, date: localDate('2026-09-14'), createdAt: '2026-09-14T10:00:00Z', updatedAt: '2026-09-14T10:00:00Z',
    mealLabel: 'Desayuno', grams: 100, source: null,
    food: { foodId: 'test-food', name: 'Fixture', per100g: { kcal: 100, protein: 5, carbohydrate: 15, fat: 2 }, source: { customFoodId: newId() } },
  });

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `test-${newId()}` }] });
    database = TestBed.inject(Database);
    people = TestBed.inject(PeopleRepository);
    drafts = TestBed.inject(DraftsRepository);
    store = TestBed.inject(WorkspaceStore);
    await store.initialize();
    personalId = store.settings()!.personalPersonId;
  });
  afterEach(async () => { vi.restoreAllMocks(); database.close(); await deleteDB(database.name); });

  async function client(name = 'Alex'): Promise<UUID> {
    const id = newId();
    await people.savePerson(id, personValue(name), null);
    return id;
  }

  it('creates only one personal workspace across concurrent initialization and reopen', async () => {
    const snapshots = await Promise.all([people.load(), people.load()]);
    expect(snapshots.map(value => value.settings.personalPersonId)).toEqual([personalId, personalId]);
    database.close();
    const restored = await people.load();
    expect(restored.people).toHaveLength(1);
    expect(restored.settings.workspaceId).toBe(store.settings()!.workspaceId);
    expect(restored.settings.mode).toBeNull();
  });

  it('commits onboarding name and mode together', async () => {
    const original = store.personalPerson()!;
    await people.savePerson(personalId, personValue('Jesús'), original.updatedAt, undefined, 'client');
    database.close();
    const restored = await people.load();
    expect(restored.settings.mode).toBe('client');
    expect(restored.people[0].displayName).toBe('Jesús');
    expect(await (await database.open()).getAll('profileRevisions')).toHaveLength(1);
  });

  it('keeps same-name clients distinct and restores trainer context after switching modes', async () => {
    await people.chooseMode('trainer');
    const first = await client();
    const second = await client();
    expect(first).not.toBe(second);
    await store.refresh();
    await store.selectPerson(second);
    await store.changeMode('client');
    expect(store.activePerson()?.id).toBe(personalId);
    expect(store.availablePeople()).toHaveLength(1);
    database.close();
    await store.refresh();
    await store.changeMode('trainer');
    expect(store.activePerson()?.id).toBe(second);
    expect(store.people().filter(person => person.displayName === 'Alex')).toHaveLength(2);
  });

  it('prevents client navigation context from selecting or creating trainer clients', async () => {
    await people.chooseMode('trainer');
    const id = await client();
    await people.chooseMode('client');
    await expect(people.selectPerson(id)).rejects.toThrow('modo actual');
    await expect(client()).rejects.toThrow('Entrenador');
    expect((await people.load()).settings.activePersonId).toBe(personalId);
  });

  it('scopes identical foreign record IDs and indexed dated logs to each person', async () => {
    await people.chooseMode('trainer');
    const first = await client(); const second = await client();
    const repository = new OwnedRepository(database, 'foodLogs');
    const firstLog = foodLog(first); const secondLog = { ...foodLog(second, firstLog.id), grams: 220 };
    await repository.add(first, firstLog);
    await repository.add(second, secondLog);
    expect(await repository.get(first, firstLog.id)).toEqual(firstLog);
    expect((await repository.list(second))[0].grams).toBe(220);
    const byDate = await (await database.open()).getAllFromIndex('foodLogs', 'by-person-date', [first, firstLog.date]);
    expect(byDate).toEqual([firstLog]);
    await expect(repository.add(first, secondLog)).rejects.toThrow('otra persona');
    expect(await repository.list(first)).toHaveLength(1);
  });

  it('rejects orphan records and prevents append-only revision overwrite', async () => {
    const repository = new OwnedRepository(database, 'profileRevisions');
    const now = new Date().toISOString();
    const revision = { id: newId(), personId: personalId, createdAt: now, updatedAt: now, profile: emptyProfile() };
    await repository.add(personalId, revision);
    await expect(repository.add(personalId, { ...revision, profile: { ...revision.profile, weightKg: 77 } })).rejects.toThrow();
    expect((await repository.get(personalId, revision.id))?.profile.weightKg).toBeNull();
    const orphanId = newId();
    await expect(repository.add(orphanId, { ...revision, personId: orphanId })).rejects.toThrow('no existe');
  });

  it('persists incomplete drafts separately and removes only the committed draft', async () => {
    await people.chooseMode('trainer');
    const subject = newId(); const draft = draftFor(personalId, subject);
    const other = draftFor(personalId, newId());
    await drafts.save(personalId, draft); await drafts.save(personalId, other);
    database.close();
    expect(await drafts.find(personalId, draft.editorKey)).toEqual(draft);
    expect((await people.load()).people).toHaveLength(1);
    await people.savePerson(subject, personValue(), null, draft);
    expect(await drafts.find(personalId, draft.editorKey)).toBeUndefined();
    expect(await drafts.find(personalId, other.editorKey)).toEqual(other);
  });

  it('rejects drafts supplied with a different owner', async () => {
    await expect(drafts.save(personalId, draftFor(newId(), newId()))).rejects.toThrow('otra persona');
  });

  it('rolls back the profile when a later revision write fails and retains its draft', async () => {
    const original = store.personalPerson()!;
    const draft = draftFor(personalId, personalId);
    await drafts.save(personalId, draft);
    const originalAdd = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'profileRevisions') throw new DOMException('Disk full', 'QuotaExceededError');
      return originalAdd.call(this, value, key);
    });
    await expect(people.savePerson(personalId, personValue('Changed'), original.updatedAt, draft)).rejects.toMatchObject({ code: 'quota' });
    expect((await people.load()).people[0]).toEqual(original);
    expect(await drafts.find(personalId, draft.editorKey)).toEqual(draft);
  });

  it('retains previous profiles and rejects a stale editor instead of overwriting changes', async () => {
    const original = store.personalPerson()!;
    await people.savePerson(personalId, personValue('Updated'), original.updatedAt);
    await expect(people.savePerson(personalId, personValue('Stale'), original.updatedAt)).rejects.toMatchObject({ code: 'conflict' });
    expect((await people.load()).people[0].displayName).toBe('Updated');
    const latest = (await people.load()).people[0];
    await people.savePerson(personalId, { ...personValue('Updated'), profile: { ...emptyProfile(), weightKg: 81 } }, latest.updatedAt);
    const revisions = await new OwnedRepository(database, 'profileRevisions').list(personalId);
    expect(revisions.map(revision => revision.profile.weightKg).sort()).toEqual([81, null]);
  });

  it('archives the active client without deleting their history and restores them', async () => {
    await people.chooseMode('trainer');
    const id = await client();
    const log = foodLog(id); const logs = new OwnedRepository(database, 'foodLogs');
    await logs.add(id, log); await people.selectPerson(id); await people.setArchived(id, true);
    expect((await people.load()).settings.activePersonId).toBe(personalId);
    await expect(people.selectPerson(id)).rejects.toThrow();
    expect(await logs.list(id)).toEqual([log]);
    await people.setArchived(id, false); await people.selectPerson(id);
    expect((await people.load()).settings.activePersonId).toBe(id);
    await expect(people.setArchived(personalId, true)).rejects.toThrow();
  });

  it('does not publish a successful mode switch when durable storage fails', async () => {
    await store.changeMode('trainer');
    vi.spyOn(people, 'chooseMode').mockRejectedValue(new DOMException('Blocked', 'QuotaExceededError'));
    expect(await store.changeMode('client')).toBe(false);
    expect(store.settings()?.mode).toBe('trainer');
    expect(store.error()).toContain('espacio');
  });

  it('validates names, finite measurements and macro allocation before writing', async () => {
    const original = store.personalPerson()!;
    await expect(people.savePerson(personalId, personValue('  '), original.updatedAt)).rejects.toMatchObject({ code: 'invalid' });
    await expect(people.savePerson(personalId, { ...personValue(), profile: { ...emptyProfile(), weightKg: NaN } }, original.updatedAt)).rejects.toThrow();
    await expect(people.savePerson(personalId, { ...personValue(), profile: { ...emptyProfile(), macros: { protein: 30, carbohydrate: 50, fat: 30 } } }, original.updatedAt)).rejects.toThrow();
    expect((await people.load()).people[0]).toEqual(original);
  });

  it('enforces unique daily snapshots and unique planned meal consumption receipts', async () => {
    const db = await database.open();
    expect(db.transaction('dailySnapshots').store.index('by-person-date').unique).toBe(true);
    expect(db.transaction('mealConsumptions').store.index('by-source').unique).toBe(true);
    expect(db.transaction('trainingSessions').store.index('by-person-exercise').multiEntry).toBe(true);
  });
});

describe('schema lifecycle', () => {
  it('migrates a v1 workspace in place without losing people or drafts', async () => {
    const name = `migration-${newId()}`;
    const personId = newId(); const now = new Date().toISOString();
    const legacy = await openDB<AppDatabase>(name, 1, { upgrade(db) {
      db.createObjectStore('settings', { keyPath: 'id' });
      db.createObjectStore('people', { keyPath: 'id' }).createIndex('by-kind', 'kind');
      db.createObjectStore('profileRevisions', { keyPath: ['personId', 'id'] }).createIndex('by-person', 'personId');
      const drafts = db.createObjectStore('drafts', { keyPath: ['personId', 'id'] });
      drafts.createIndex('by-person', 'personId'); drafts.createIndex('by-editor', ['personId', 'editorKey'], { unique: true });
    } });
    await legacy.put('people', { id: personId, kind: 'personal', displayName: 'Before migration', reference: '', archived: false, profile: emptyProfile(), createdAt: now, updatedAt: now });
    legacy.close();
    const database = new Database(name);
    const current = await database.open();
    expect(current.version).toBe(2);
    expect((await current.get('people', personId))?.displayName).toBe('Before migration');
    expect(current.objectStoreNames).toHaveLength(13);
    database.close(); await deleteDB(name);
  });

  it('reports blocked upgrades and continues when the blocking tab closes', async () => {
    const name = `blocked-${newId()}`;
    const legacy = await openDB(name, 1);
    const database = new Database(name);
    const pending = database.open();
    await vi.waitFor(() => expect(database.status()).toBe('blocked'));
    legacy.close();
    // This minimal old DB lacks v1 stores, so upgrading must fail visibly, never reset it.
    await expect(pending).rejects.toBeInstanceOf(StorageFailure);
    expect(database.status()).toBe('error');
    database.close(); await deleteDB(name);
  });

  it('closes a connection when a newer tab needs to upgrade it', async () => {
    const name = `blocking-${newId()}`;
    const database = new Database(name);
    await database.open();
    const future = await openDB(name, 3);
    expect(database.status()).toBe('closed');
    future.close(); database.close(); await deleteDB(name);
  });

  it('classifies unavailable and quota failures without masking existing domain errors', () => {
    expect(storageFailure(new DOMException('Full', 'QuotaExceededError')).code).toBe('quota');
    expect(storageFailure(new Error('Denied')).code).toBe('unavailable');
    const conflict = new StorageFailure('conflict', 'Changed');
    expect(storageFailure(conflict)).toBe(conflict);
  });
});
