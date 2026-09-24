import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../../core/storage/database';
import { newId, type UUID } from '../../../core/domain/identity';
import { PeopleRepository } from '../../people/people.repository';
import { emptyProfile } from '../../people/person.model';
import { MealPlansRepository, latestPlan } from './meal-plans.repository';
import { mealDraft } from './meal.fixtures';

describe('owner-bound meal revisions and drafts', () => {
  let db: Database; let repo: MealPlansRepository; let people: PeopleRepository; let owner: UUID;
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [{ provide: DATABASE_NAME, useValue: `meals-${newId()}` }] });
    db = TestBed.inject(Database); repo = TestBed.inject(MealPlansRepository); people = TestBed.inject(PeopleRepository);
    owner = (await people.load()).settings.personalPersonId; await people.chooseMode('trainer');
  });
  afterEach(async () => { vi.restoreAllMocks(); db.close(); await deleteDB(db.name); });
  async function initial() { const draft = mealDraft(owner); await repo.saveDraft(owner, draft, null); return repo.save(owner, draft); }
  it('keeps prior revisions detached across edits and archive/restore, writing no actual food logs', async () => {
    const first = await initial(); const snapshot = structuredClone(first);
    const edit = mealDraft(owner, first.planId, first.id); edit.payload.content = structuredClone(first.content);
    const other = mealDraft(owner); await repo.saveDraft(owner, other, null); await repo.saveDraft(owner, edit, null);
    const second = await repo.save(owner, edit); edit.payload.content.weeks[0].name = 'Mutation';
    const archived = await repo.setArchived(owner, second, true);
    await expect(repo.save(owner, mealDraft(owner, first.planId, archived.id))).rejects.toMatchObject({ code: 'conflict' });
    const restored = await repo.setArchived(owner, archived, false);
    db.close(); expect((await repo.history(owner)).find(item => item.id === first.id)).toEqual(snapshot);
    expect(restored.content).toEqual(snapshot.content); expect(restored.parentRevisionId).toBe(archived.id);
    expect((await repo.listDrafts(owner))).toEqual([other]);
    expect(await (await db.open()).getAll('foodLogs')).toEqual([]);
    expect((await db.open()).objectStoreNames).toHaveLength(13);
  });
  it('retains invalid drafts and rejects cross-person/mode commits for same-name people', async () => {
    const draft = mealDraft(owner); draft.payload.content.weeks[0].days[0].meals[0].foods[0].grams = null;
    await repo.saveDraft(owner, draft, null); await expect(repo.save(owner, draft)).rejects.toMatchObject({ code: 'invalid' });
    expect(await repo.listDrafts(owner)).toEqual([draft]); expect(await repo.history(owner)).toEqual([]);
    const a = newId(); const b = newId(); const planId = newId();
    for (const id of [a, b]) await people.savePerson(id, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null);
    await people.selectPerson(a); const first = mealDraft(a, planId); await repo.saveDraft(a, first, null); await repo.save(a, first);
    const second = mealDraft(b, planId); await expect(repo.saveDraft(b, second, null)).rejects.toMatchObject({ code: 'invalid' });
    await people.selectPerson(b); await repo.saveDraft(b, second, null);
    await people.chooseMode('client'); await expect(repo.save(b, second)).rejects.toMatchObject({ code: 'invalid' });
    await people.chooseMode('trainer'); await repo.save(b, second);
    expect((await repo.list(a))[0].personId).toBe(a); expect((await repo.list(b))[0].personId).toBe(b);
    await expect(repo.setArchived(b, (await repo.list(a))[0], true)).rejects.toMatchObject({ code: 'invalid' });
  });
  it('compares full drafts and heads, rejects divergent histories and stale archives', async () => {
    const saved = await initial(); const draft = mealDraft(owner, saved.planId, saved.id);
    await repo.saveDraft(owner, draft, null);
    const other = structuredClone(draft); other.payload.name = 'Other tab'; await repo.saveDraft(owner, other, draft);
    await expect(repo.saveDraft(owner, draft, draft)).rejects.toMatchObject({ code: 'conflict' });
    await expect(repo.save(owner, draft)).rejects.toMatchObject({ code: 'conflict' });
    const updated = await repo.save(owner, other);
    await expect(repo.setArchived(owner, saved, true)).rejects.toMatchObject({ code: 'conflict' });
    expect(() => latestPlan([saved, updated, { ...updated, id: newId() }], saved.planId)).toThrow('divergentes');
    expect(() => latestPlan([{ ...updated, parentRevisionId: newId() }], saved.planId)).toThrow('incompletas');
    const cyclic = newId(); expect(() => latestPlan([saved, { ...saved, id: cyclic, parentRevisionId: cyclic }], saved.planId)).toThrow('incompletas');
  });
  it('rolls back draft deletion when the revision write fails and permits retry', async () => {
    const draft = mealDraft(owner); await repo.saveDraft(owner, draft, null);
    const original = IDBObjectStore.prototype.add;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'mealPlanRevisions') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(repo.save(owner, draft)).rejects.toMatchObject({ code: 'quota' });
    expect(await repo.listDrafts(owner)).toEqual([draft]); expect(await repo.history(owner)).toEqual([]);
    fail.mockRestore(); await repo.save(owner, draft); expect(await repo.listDrafts(owner)).toEqual([]);
  });
});
