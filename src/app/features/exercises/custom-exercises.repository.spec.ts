import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { newId, type UUID } from '../../core/domain/identity';
import { DraftsRepository } from '../../core/storage/drafts.repository';
import type { Draft } from '../../core/storage/draft.model';
import { PeopleRepository } from '../people/people.repository';
import { emptyProfile } from '../people/person.model';
import { CustomExercisesRepository } from './custom-exercises.repository';
import type { CustomExerciseFormValue } from './exercise.model';

const input: CustomExerciseFormValue = { name: 'Remo propio', category: 'strength', loggingType: 'assisted_bodyweight', instruction: 'Movimiento controlado', notes: 'Personal', equipment: 'Banda, Banco' };
describe('person-owned custom exercise transactions', () => {
  let database: Database; let repository: CustomExercisesRepository; let people: PeopleRepository; let drafts: DraftsRepository; let personal: UUID;
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `exercises-${newId()}` }] });
    database = TestBed.inject(Database); repository = TestBed.inject(CustomExercisesRepository); people = TestBed.inject(PeopleRepository); drafts = TestBed.inject(DraftsRepository);
    personal = (await people.load()).settings.personalPersonId; await people.chooseMode('trainer');
  });
  afterEach(async () => { vi.restoreAllMocks(); database.close(); await deleteDB(database.name); });
  async function draftFor(owner = personal, id = newId(), value = input, baseUpdatedAt: string | null = null): Promise<Draft> {
    const now = new Date().toISOString();
    const draft: Draft = { personId: owner, id: newId(), createdAt: now, updatedAt: now, editorKey: `custom-exercise:${id}`,
      payload: { kind: 'custom-exercise', exerciseId: id, value, baseUpdatedAt } };
    await drafts.save(owner, draft); return draft;
  }
  function exerciseId(draft: Draft): UUID { if (draft.payload.kind !== 'custom-exercise') throw new Error(); return draft.payload.exerciseId; }
  async function client(): Promise<UUID> { const id = newId(); await people.savePerson(id, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null); return id; }

  it('commits stable identity/metadata with only its draft deletion, then reopens, edits, archives and restores', async () => {
    const draft = await draftFor(); const other = await draftFor(); const id = exerciseId(draft);
    await repository.save(personal, id, input, null, draft); database.close();
    const saved = (await repository.get(personal, id))!;
    expect(saved).toMatchObject({ id, personId: personal, name: input.name, loggingType: 'assisted_bodyweight', equipment: ['Banda', 'Banco'], archived: false });
    expect(await drafts.find(personal, draft.editorKey)).toBeUndefined(); expect(await drafts.find(personal, other.editorKey)).toEqual(other);
    const changed = { ...input, name: 'Nuevo nombre' }; const edit = await draftFor(personal, id, changed, saved.updatedAt);
    await repository.save(personal, id, changed, saved.updatedAt, edit);
    const edited = (await repository.get(personal, id))!; expect(edited.createdAt).toBe(saved.createdAt); expect(edited.updatedAt > saved.updatedAt).toBe(true);
    await repository.setArchived(personal, edited, true);
    const archived = (await repository.get(personal, id))!; expect(archived.archived).toBe(true);
    await repository.setArchived(personal, archived, false); expect((await repository.get(personal, id))?.archived).toBe(false);
  });
  it('isolates identical IDs for same-name clients and rejects wrong-owner drafts/archive', async () => {
    const first = await client(); const second = await client(); const id = newId();
    const firstDraft = await draftFor(first, id); const changed = { ...input, name: 'Otro' }; const secondDraft = await draftFor(second, id, changed);
    await people.selectPerson(first); await repository.save(first, id, input, null, firstDraft);
    await people.selectPerson(second);
    await expect(repository.save(second, id, input, null, firstDraft)).rejects.toThrow('borrador');
    await expect(repository.setArchived(second, (await repository.get(first, id))!, true)).rejects.toThrow('otra persona');
    await repository.save(second, id, changed, null, secondDraft);
    expect((await repository.list(first)).map(exercise => exercise.name)).toEqual(['Remo propio']);
    expect((await repository.list(second)).map(exercise => exercise.name)).toEqual(['Otro']);
  });
  it('rejects delayed saves after person or mode changes without consuming drafts', async () => {
    const owner = await client(); await people.selectPerson(owner); const draft = await draftFor(owner);
    await people.chooseMode('client');
    await expect(repository.save(owner, exerciseId(draft), input, null, draft)).rejects.toThrow('persona activa cambió');
    expect(await repository.list(owner)).toEqual([]); expect(await drafts.find(owner, draft.editorKey)).toEqual(draft);
    await people.chooseMode('trainer'); await people.selectPerson(personal);
    await expect(repository.save(owner, exerciseId(draft), input, null, draft)).rejects.toThrow('persona activa cambió');
  });
  it('rolls back draft deletion on quota failure and supports retry', async () => {
    const draft = await draftFor(); const original = IDBObjectStore.prototype.put;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'customExercises') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(repository.save(personal, exerciseId(draft), input, null, draft)).rejects.toMatchObject({ code: 'quota' });
    expect(await drafts.find(personal, draft.editorKey)).toEqual(draft); expect(await repository.list(personal)).toEqual([]);
    fail.mockRestore(); await repository.save(personal, exerciseId(draft), input, null, draft); expect(await repository.list(personal)).toHaveLength(1);
  });
  it('rejects invalid data and mismatched or changed draft payloads before committing', async () => {
    const draft = await draftFor(); const id = exerciseId(draft);
    await expect(repository.save(personal, id, { ...input, category: '' }, null, draft)).rejects.toMatchObject({ code: 'invalid' });
    await expect(repository.save(personal, id, { ...input, name: 'Different' }, null, draft)).rejects.toMatchObject({ code: 'conflict' });
    const changed = structuredClone(draft); if (changed.payload.kind === 'custom-exercise') changed.payload.value.notes = 'Other tab';
    await drafts.save(personal, changed);
    await expect(repository.save(personal, id, input, null, draft)).rejects.toMatchObject({ code: 'conflict' });
    expect(await repository.list(personal)).toEqual([]); expect(await drafts.find(personal, draft.editorKey)).toEqual(changed);
  });
  it('rejects stale edits and archive races while preserving drafts', async () => {
    const draft = await draftFor(); const id = exerciseId(draft); await repository.save(personal, id, input, null, draft);
    const before = (await repository.get(personal, id))!; const edit = await draftFor(personal, id, input, before.updatedAt);
    await repository.setArchived(personal, before, true);
    await expect(repository.save(personal, id, input, before.updatedAt, edit)).rejects.toMatchObject({ code: 'conflict' });
    await expect(repository.setArchived(personal, before, false)).rejects.toMatchObject({ code: 'conflict' });
    expect(await drafts.find(personal, edit.editorKey)).toEqual(edit);
  });
  it('allows exactly one of two concurrent commits against the same base', async () => {
    const draft = await draftFor(); const id = exerciseId(draft); await repository.save(personal, id, input, null, draft);
    const saved = (await repository.get(personal, id))!; const edit = await draftFor(personal, id, input, saved.updatedAt);
    const results = await Promise.allSettled([repository.save(personal, id, input, saved.updatedAt, edit), repository.save(personal, id, input, saved.updatedAt, edit)]);
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await repository.list(personal)).toHaveLength(1);
  });
});
