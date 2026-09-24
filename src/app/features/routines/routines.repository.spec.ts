import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { newId, type UUID } from '../../core/domain/identity';
import { PeopleRepository } from '../people/people.repository';
import { emptyProfile } from '../people/person.model';
import { RoutinesRepository, latestRevision } from './routines.repository';
import { routineDraft } from './routine.fixtures';

describe('append-only owner-bound routine transactions', () => {
  let database: Database; let repository: RoutinesRepository; let people: PeopleRepository; let owner: UUID;
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `routine-${newId()}` }] });
    database = TestBed.inject(Database); repository = TestBed.inject(RoutinesRepository); people = TestBed.inject(PeopleRepository);
    owner = (await people.load()).settings.personalPersonId; await people.chooseMode('trainer');
  });
  afterEach(async () => { vi.restoreAllMocks(); database.close(); await deleteDB(database.name); });
  async function client(): Promise<UUID> { const id = newId(); await people.savePerson(id, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null); return id; }
  async function initial() { const draft = routineDraft(owner); await repository.saveDraft(owner, draft, null); return repository.save(owner, draft); }
  it('reopens immutable revisions, preserving logical IDs through edit/archive/restore and deleting only the committed draft', async () => {
    const first = await initial(); const snapshot = structuredClone(first);
    const edit = routineDraft(owner, first.planId, first.id); edit.payload.content = structuredClone(first.content); edit.payload.name = 'Edited';
    const other = routineDraft(owner); await repository.saveDraft(owner, other, null); await repository.saveDraft(owner, edit, null);
    const second = await repository.save(owner, edit); edit.payload.content.weeks[0].name = 'Later mutation';
    const archived = await repository.setArchived(owner, second, true); const restored = await repository.setArchived(owner, archived, false);
    database.close(); const history = await repository.history(owner);
    expect(history).toHaveLength(4); expect(history.find(item => item.id === first.id)).toEqual(snapshot);
    expect(restored.content).toEqual(first.content); expect(restored.parentRevisionId).toBe(archived.id); expect(second.parentRevisionId).toBe(first.id);
    expect(await repository.list(owner)).toEqual([restored]); expect(await repository.listDrafts(owner)).toEqual([other]);
    expect((await database.open()).objectStoreNames).toHaveLength(13);
  });
  it('rejects incomplete drafts before revision writes and retains them for recovery', async () => {
    const draft = routineDraft(owner); draft.payload.content.weeks[0].days[0].exercises[0].sets = [];
    await repository.saveDraft(owner, draft, null); await expect(repository.save(owner, draft)).rejects.toMatchObject({ code: 'invalid' });
    expect(await repository.history(owner)).toEqual([]); expect(await repository.listDrafts(owner)).toEqual([draft]);
  });
  it('isolates same-name people and checks active person/mode inside commits', async () => {
    const a = await client(); const b = await client(); const id = newId();
    const first = routineDraft(a, id); const second = routineDraft(b, id); second.payload.name = 'Second';
    await repository.saveDraft(a, first, null); await repository.saveDraft(b, second, null);
    await expect(repository.saveDraft(b, first, null)).rejects.toMatchObject({ code: 'invalid' });
    await people.selectPerson(a); const saved = await repository.save(a, first);
    await expect(repository.setArchived(b, saved, true)).rejects.toMatchObject({ code: 'invalid' });
    await expect(repository.save(b, second)).rejects.toMatchObject({ code: 'invalid' });
    await people.selectPerson(b); await people.chooseMode('client');
    await expect(repository.save(b, second)).rejects.toMatchObject({ code: 'invalid' });
    await people.chooseMode('trainer'); await repository.save(b, second);
    expect((await repository.list(a))[0].name).toBe('Mixed plan'); expect((await repository.list(b))[0].name).toBe('Second');
  });
  it('uses full durable payload CAS, even when timestamps match', async () => {
    const draft = routineDraft(owner); await repository.saveDraft(owner, draft, null);
    const changed = structuredClone(draft); changed.payload.name = 'Other tab'; await repository.saveDraft(owner, changed, draft);
    await expect(repository.saveDraft(owner, draft, draft)).rejects.toMatchObject({ code: 'conflict' });
    await expect(repository.save(owner, draft)).rejects.toMatchObject({ code: 'conflict' });
    expect(await repository.listDrafts(owner)).toEqual([changed]); expect(await repository.history(owner)).toEqual([]);
  });
  it('rolls back draft deletion if adding the revision fails', async () => {
    const draft = routineDraft(owner); await repository.saveDraft(owner, draft, null);
    const original = IDBObjectStore.prototype.add;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'routineRevisions') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(repository.save(owner, draft)).rejects.toMatchObject({ code: 'quota' });
    expect(await repository.listDrafts(owner)).toEqual([draft]); expect(await repository.history(owner)).toEqual([]);
    fail.mockRestore(); await repository.save(owner, draft); expect(await repository.listDrafts(owner)).toEqual([]);
  });
  it('allows one concurrent commit and rejects stale archive/edit bases', async () => {
    const saved = await initial(); const draft = routineDraft(owner, saved.planId, saved.id); await repository.saveDraft(owner, draft, null);
    const results = await Promise.allSettled([repository.save(owner, draft), repository.save(owner, draft)]);
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    await expect(repository.setArchived(owner, saved, true)).rejects.toMatchObject({ code: 'conflict' });
    const current = (await repository.latest(owner, saved.planId))!; const edit = routineDraft(owner, saved.planId, current.id);
    await repository.saveDraft(owner, edit, null); await repository.setArchived(owner, current, true);
    await expect(repository.save(owner, edit)).rejects.toMatchObject({ code: 'conflict' }); expect(await repository.listDrafts(owner)).toEqual([edit]);
  });
  it('detects divergent heads rather than sorting equal timestamps into silent last-write-wins', async () => {
    const saved = await initial();
    expect(() => latestRevision([saved, { ...saved, id: newId() }], saved.planId)).toThrow('divergentes');
  });
});
