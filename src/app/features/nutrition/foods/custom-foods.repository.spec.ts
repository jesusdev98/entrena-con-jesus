import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../../core/storage/database';
import { newId, type UUID } from '../../../core/domain/identity';
import { DraftsRepository } from '../../../core/storage/drafts.repository';
import type { Draft } from '../../../core/storage/draft.model';
import { PeopleRepository } from '../../people/people.repository';
import { emptyProfile } from '../../people/person.model';
import { CustomFoodsRepository } from './custom-foods.repository';
import type { CustomFoodFormValue } from '../nutrition.model';

const input: CustomFoodFormValue = { name: 'Receta local', note: 'Etiqueta', kcal: 123.456, protein: 3, carbohydrate: 7, fat: 0 };
describe('person-owned custom food transactions', () => {
  let database: Database; let repository: CustomFoodsRepository; let people: PeopleRepository; let drafts: DraftsRepository; let personal: UUID;
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `foods-${newId()}` }] });
    database = TestBed.inject(Database); repository = TestBed.inject(CustomFoodsRepository); people = TestBed.inject(PeopleRepository); drafts = TestBed.inject(DraftsRepository);
    personal = (await people.load()).settings.personalPersonId; await people.chooseMode('trainer');
  });
  afterEach(async () => { vi.restoreAllMocks(); database.close(); await deleteDB(database.name); });
  async function draftFor(owner = personal, id = newId(), value = input, baseUpdatedAt: string | null = null): Promise<Draft> {
    const now = new Date().toISOString();
    const draft: Draft = { personId: owner, id: newId(), createdAt: now, updatedAt: now, editorKey: `custom-food:${id}`,
      payload: { kind: 'custom-food', foodId: id, value, baseUpdatedAt } };
    await drafts.save(owner, draft); return draft;
  }
  function foodId(draft: Draft): UUID { if (draft.payload.kind !== 'custom-food') throw new Error(); return draft.payload.foodId; }
  async function client(): Promise<UUID> { const id = newId(); await people.savePerson(id, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null); return id; }

  it('commits exact values/provenance and only its draft, then reopens, archives and restores', async () => {
    const draft = await draftFor(); const other = await draftFor();
    await repository.save(personal, foodId(draft), input, null, draft);
    database.close();
    const saved = (await repository.get(personal, foodId(draft)))!;
    expect(saved.per100g.kcal).toBe(123.456); expect(saved.source).toEqual({ kind: 'user', note: 'Etiqueta' });
    expect(await drafts.find(personal, draft.editorKey)).toBeUndefined(); expect(await drafts.find(personal, other.editorKey)).toEqual(other);
    await repository.setArchived(personal, saved, true);
    const archived = (await repository.get(personal, saved.id))!; expect(archived.archived).toBe(true);
    await repository.setArchived(personal, archived, false); expect((await repository.get(personal, saved.id))?.archived).toBe(false);
  });
  it('isolates identical food IDs for same-name clients and rejects wrong-owner drafts', async () => {
    const first = await client(); const second = await client(); const id = newId();
    const firstDraft = await draftFor(first, id); const secondDraft = await draftFor(second, id, { ...input, name: 'Otro' });
    await people.selectPerson(first); await repository.save(first, id, input, null, firstDraft);
    await people.selectPerson(second);
    await expect(repository.save(second, id, input, null, firstDraft)).rejects.toThrow('borrador');
    await repository.save(second, id, { ...input, name: 'Otro' }, null, secondDraft);
    expect((await repository.list(first)).map(food => food.name)).toEqual(['Receta local']);
    expect((await repository.list(second)).map(food => food.name)).toEqual(['Otro']);
  });
  it('rejects a delayed save after active person or mode changed without consuming its draft', async () => {
    const owner = await client(); await people.selectPerson(owner); const draft = await draftFor(owner);
    await people.chooseMode('client');
    await expect(repository.save(owner, foodId(draft), input, null, draft)).rejects.toThrow('persona activa cambió');
    expect(await repository.list(owner)).toEqual([]); expect(await drafts.find(owner, draft.editorKey)).toEqual(draft);
    await people.chooseMode('trainer'); await people.selectPerson(personal);
    await expect(repository.save(owner, foodId(draft), input, null, draft)).rejects.toThrow('persona activa cambió');
  });
  it('rolls back draft deletion on quota failure and retries without data loss', async () => {
    const draft = await draftFor(); const original = IDBObjectStore.prototype.put;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'customFoods') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(repository.save(personal, foodId(draft), input, null, draft)).rejects.toMatchObject({ code: 'quota' });
    expect(await drafts.find(personal, draft.editorKey)).toEqual(draft); expect(await repository.list(personal)).toEqual([]);
    fail.mockRestore(); await repository.save(personal, foodId(draft), input, null, draft); expect(await repository.list(personal)).toHaveLength(1);
  });
  it('rejects invalid custom values before changing persisted data', async () => {
    const draft = await draftFor();
    await expect(repository.save(personal, foodId(draft), { ...input, carbohydrate: Infinity }, null, draft)).rejects.toMatchObject({ code: 'invalid' });
    expect(await repository.list(personal)).toEqual([]); expect(await drafts.find(personal, draft.editorKey)).toEqual(draft);
  });
  it('rejects stale edits and archive races while preserving drafts', async () => {
    const draft = await draftFor(); const id = foodId(draft); await repository.save(personal, id, input, null, draft);
    const before = (await repository.get(personal, id))!; const edit = await draftFor(personal, id, input, before.updatedAt);
    await repository.setArchived(personal, before, true);
    await expect(repository.save(personal, id, input, before.updatedAt, edit)).rejects.toMatchObject({ code: 'conflict' });
    await expect(repository.setArchived(personal, before, false)).rejects.toMatchObject({ code: 'conflict' });
    expect(await drafts.find(personal, edit.editorKey)).toEqual(edit);
  });
});
