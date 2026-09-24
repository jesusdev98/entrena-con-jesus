import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../../core/storage/database';
import { DraftCoordinator } from '../../../core/storage/draft-coordinator';
import { newId, type UUID } from '../../../core/domain/identity';
import { PeopleRepository } from '../../people/people.repository';
import { WorkspaceStore } from '../../people/workspace.store';
import { emptyProfile } from '../../people/person.model';
import { MealEditor } from './meal-editor';
import { MealPlansRepository } from './meal-plans.repository';
import { mealDraft } from './meal.fixtures';

describe('weekly meal editor and recoverable owner drafts', () => {
  let db: Database; let repo: MealPlansRepository; let workspace: WorkspaceStore; let owner: UUID;
  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [MealEditor], providers: [{ provide: DATABASE_NAME, useValue: `meal-editor-${newId()}` }] });
    db = TestBed.inject(Database); repo = TestBed.inject(MealPlansRepository); workspace = TestBed.inject(WorkspaceStore);
    await workspace.initialize(); await workspace.changeMode('trainer'); owner = workspace.activePerson()!.id;
  });
  afterEach(async () => { TestBed.resetTestingModule(); vi.restoreAllMocks(); db.close(); await deleteDB(db.name); });
  async function editor(person = owner, planId?: UUID) {
    const fixture = TestBed.createComponent(MealEditor);
    fixture.componentRef.setInput('personId', person); fixture.componentRef.setInput('editorKey', planId ? `meal-plan:${planId}` : 'meal-plan:new'); fixture.componentRef.setInput('planId', planId);
    fixture.detectChanges(); await vi.waitFor(() => expect(fixture.componentInstance.store.loading()).toBe(false)); fixture.detectChanges(); return fixture;
  }
  async function initial() { const draft = mealDraft(owner); await repo.saveDraft(owner, draft, null); return repo.save(owner, draft); }
  it('recovers incomplete gram fields and never publishes them as a saved plan or actual intake', async () => {
    const first = await editor(); first.componentInstance.form.controls.name.setValue('Incomplete');
    const food = mealDraft(owner).payload.content.weeks[0].days[0].meals[0].foods[0]; food.grams = null;
    const store = first.componentInstance.store; const content = structuredClone(store.value().content);
    content.weeks[0].days[0].meals[0].foods.push(food); store.change('Incomplete', content);
    expect(await store.flush()).toBe(true); expect(await store.save()).toBe(false);
    expect(await repo.list(owner)).toEqual([]); first.destroy(); db.close();
    const recovered = await editor(); expect(recovered.componentInstance.store.value().content.weeks[0].days[0].meals[0].foods[0].grams).toBeNull();
    expect(recovered.nativeElement.textContent).toContain('Borrador recuperado');
    expect(await (await db.open()).getAll('foodLogs')).toEqual([]);
  });
  it('keeps invalid nonfinite gram inputs recoverable without crashing previews', async () => {
    const fixture = await editor(); const store = fixture.componentInstance.store;
    const content = mealDraft(owner).payload.content; content.weeks[0].days[0].meals[0].foods[0].grams = Infinity;
    store.change('Invalid grams', content); expect(() => fixture.detectChanges()).not.toThrow();
    expect(await store.save()).toBe(false); expect(store.errors()).toContain('Indica gramos mayores que cero para cada alimento.');
  });
  it('blocks transitions on failed drafts and retries without changing owners', async () => {
    const fixture = await editor(); const store = fixture.componentInstance.store;
    const fail = vi.spyOn(repo, 'saveDraft').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    store.change('Mine', mealDraft(owner).payload.content); expect(await workspace.changeMode('client')).toBe(false);
    expect(store.value().name).toBe('Mine'); fail.mockRestore();
    expect(await TestBed.inject(DraftCoordinator).flush()).toBe(true);
    expect(await store.save()).toBe(true); expect(await repo.history(owner)).toHaveLength(1);
  });
  it('keeps same-name client drafts isolated from personal mode and rejects old-owner saves', async () => {
    const people = TestBed.inject(PeopleRepository); const a = newId(); const b = newId();
    for (const id of [a, b]) await people.savePerson(id, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null);
    await workspace.refresh(); await workspace.selectPerson(a); const first = await editor(a);
    first.componentInstance.store.change('First Alex', mealDraft(a).payload.content);
    expect(await workspace.selectPerson(b)).toBe(true);
    expect(await first.componentInstance.store.save()).toBe(false); first.destroy();
    const second = await editor(b); second.componentInstance.form.controls.name.setValue('Second Alex');
    expect(await workspace.changeMode('client')).toBe(true); second.destroy();
    const personal = await editor(owner); expect(personal.componentInstance.store.value().name).toBe(''); personal.destroy();
    await workspace.changeMode('trainer'); await workspace.selectPerson(a);
    const recovered = await editor(a); expect(recovered.componentInstance.store.value().name).toBe('First Alex');
  });
  it.each(['mine', 'current'] as const)('resolves %s after another tab consumes the draft', async choice => {
    const saved = await initial(); const fixture = await editor(owner, saved.planId); const store = fixture.componentInstance.store;
    store.change('My edit', store.value().content); await store.flush();
    const durable = (await repo.listDrafts(owner))[0]; const remote = structuredClone(durable); remote.payload.name = 'Other edit';
    await repo.saveDraft(owner, remote, durable); await repo.save(owner, remote);
    expect(await store.save()).toBe(false); expect(store.conflict()).toBe(true); expect(store.otherDraft()).toBeNull();
    await store.resolve(choice); expect(store.conflict()).toBe(false); expect(await store.save()).toBe(true);
    expect((await repo.list(owner))[0].name).toBe(choice === 'mine' ? 'My edit' : 'Other edit');
  });
  it('preserves another tab draft while copying all nested IDs and uses unique native labels', async () => {
    const fixture = await editor(); const store = fixture.componentInstance.store;
    store.change('Local', mealDraft(owner).payload.content); await store.flush(); fixture.detectChanges();
    const firstId = store.value().content.weeks[0].id;
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[aria-label="Duplicar semana 1"]')!.click(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const ids = [...root.querySelectorAll('[id]')].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const label of root.querySelectorAll('label')) expect(label.control).not.toBeNull();
    const original = store.value().content.weeks[0]; const copy = store.value().content.weeks[1];
    expect(copy.id).not.toBe(firstId); expect(copy.days[0].meals[0].foods[0].id).not.toBe(original.days[0].meals[0].foods[0].id);
    expect(await store.flush()).toBe(true);
    const durable = (await repo.listDrafts(owner))[0]; const other = structuredClone(durable); other.payload.name = 'Other'; await repo.saveDraft(owner, other, durable);
    store.change('Local later', store.value().content); expect(await store.flush()).toBe(false); expect(store.conflict()).toBe(true);
    await store.resolve('copy'); expect(await store.save()).toBe(true);
    expect((await repo.listDrafts(owner))[0].payload.name).toBe('Other');
  });
  it('retains an archived edit as a detached copy and recovers a failed commit', async () => {
    const saved = await initial(); const fixture = await editor(owner, saved.planId); const store = fixture.componentInstance.store;
    store.change('Local edit', store.value().content); await repo.setArchived(owner, saved, true);
    expect(await store.save()).toBe(false); await store.resolve('copy');
    const fail = vi.spyOn(repo, 'save').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    expect(await store.save()).toBe(false); expect(await repo.listDrafts(owner)).toHaveLength(2); fail.mockRestore();
    expect(await store.save()).toBe(true); expect((await repo.list(owner)).find(item => item.planId === saved.planId)?.archived).toBe(true);
  });
});
