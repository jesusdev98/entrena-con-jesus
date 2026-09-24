import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { newId, type UUID } from '../../core/domain/identity';
import { PeopleRepository } from '../people/people.repository';
import { WorkspaceStore } from '../people/workspace.store';
import { emptyProfile } from '../people/person.model';
import { RoutineEditor } from './routine-editor';
import { RoutinesRepository } from './routines.repository';
import { routineDraft, routineFixture } from './routine.fixtures';
import { SetEditor } from './set-editor';
import { newSet } from './routine-planning';
import type { LoggingType } from '../exercises/exercise.model';

describe('routine editor recovery and composition', () => {
  let database: Database; let repository: RoutinesRepository; let workspace: WorkspaceStore; let owner: UUID;
  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [RoutineEditor], providers: [{ provide: DATABASE_NAME, useValue: `routine-editor-${newId()}` }] });
    database = TestBed.inject(Database); repository = TestBed.inject(RoutinesRepository); workspace = TestBed.inject(WorkspaceStore);
    await workspace.initialize(); await workspace.changeMode('trainer'); owner = workspace.activePerson()!.id;
  });
  afterEach(async () => { TestBed.resetTestingModule(); vi.restoreAllMocks(); database.close(); await deleteDB(database.name); });
  async function editor(person = owner, planId?: UUID) {
    const fixture = TestBed.createComponent(RoutineEditor);
    fixture.componentRef.setInput('personId', person); fixture.componentRef.setInput('editorKey', planId ? `routine:${planId}` : 'routine:new'); fixture.componentRef.setInput('planId', planId);
    fixture.detectChanges(); await vi.waitFor(() => expect(fixture.componentInstance.store.loading()).toBe(false)); fixture.detectChanges(); return fixture;
  }
  async function initial() { const draft = routineDraft(owner); await repository.saveDraft(owner, draft, null); return repository.save(owner, draft); }
  it('recovers incomplete values without presenting or committing a saved valid plan', async () => {
    const first = await editor(); first.componentInstance.form.controls.name.setValue('Unfinished');
    expect(await first.componentInstance.store.flush()).toBe(true); expect(await first.componentInstance.store.save()).toBe(false);
    expect(await repository.list(owner)).toEqual([]); first.destroy(); database.close();
    const second = await editor(); expect(second.componentInstance.form.controls.name.value).toBe('Unfinished');
    expect(second.nativeElement.textContent).toContain('Borrador recuperado'); expect(second.componentInstance.store.value().content.weeks[0].days[0].exercises).toEqual([]);
  });
  it('blocks transitions on quota failure and retries the same owner-bound values', async () => {
    const fixture = await editor(); const store = fixture.componentInstance.store;
    const fail = vi.spyOn(repository, 'saveDraft').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    store.change('Mine', routineFixture()); expect(await workspace.changeMode('client')).toBe(false);
    expect(store.value().name).toBe('Mine'); expect(store.error()).toContain('espacio');
    fail.mockRestore(); expect(await TestBed.inject(DraftCoordinator).flush()).toBe(true); expect(await store.save()).toBe(true);
    expect(await store.save()).toBe(false); expect(await repository.history(owner)).toHaveLength(1);
  });
  it('flushes and isolates same-name clients across mode/person changes', async () => {
    const people = TestBed.inject(PeopleRepository); const a = newId(); const b = newId();
    for (const id of [a, b]) await people.savePerson(id, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null);
    await workspace.refresh(); await workspace.selectPerson(a); const first = await editor(a);
    first.componentInstance.store.change('First only', routineFixture()); expect(await workspace.selectPerson(b)).toBe(true);
    expect(await first.componentInstance.store.save()).toBe(false); expect(first.componentInstance.store.error()).toContain('persona activa cambió'); first.destroy();
    const second = await editor(b); expect(second.componentInstance.store.value().name).toBe(''); second.componentInstance.form.controls.name.setValue('Second only');
    expect(await workspace.changeMode('client')).toBe(true); second.destroy(); const personal = await editor(owner); expect(personal.componentInstance.store.value().name).toBe(''); personal.destroy();
    await workspace.changeMode('trainer'); const recoveredB = await editor(b); expect(recoveredB.componentInstance.store.value().name).toBe('Second only'); recoveredB.destroy();
    await workspace.selectPerson(a); const recoveredA = await editor(a); expect(recoveredA.componentInstance.store.value().name).toBe('First only');
  });
  it.each(['mine', 'current'] as const)('resolves %s after another tab consumes the shared draft, preserving all revisions', async choice => {
    const saved = await initial(); const fixture = await editor(owner, saved.planId); const store = fixture.componentInstance.store;
    store.change('My edit', store.value().content); await store.flush();
    const durable = (await repository.listDrafts(owner))[0]; const remote = structuredClone(durable); remote.payload.name = 'Other edit';
    await repository.saveDraft(owner, remote, durable); await repository.save(owner, remote);
    expect(await store.save()).toBe(false); fixture.detectChanges(); expect(store.conflict()).toBe(true); expect(store.otherDraft()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Compara antes de continuar'); expect(fixture.nativeElement.textContent).toContain('Other edit');
    await store.resolve(choice); expect(store.conflict()).toBe(false); expect(await store.save()).toBe(true);
    expect((await repository.list(owner))[0].name).toBe(choice === 'mine' ? 'My edit' : 'Other edit'); expect(await repository.history(owner)).toHaveLength(3);
  });
  it('compares same-timestamp draft conflicts and keeps unsaved edits until explicit copy', async () => {
    const fixture = await editor(); const store = fixture.componentInstance.store; store.change('Mine', routineFixture()); await store.flush();
    const durable = (await repository.listDrafts(owner))[0]; const other = structuredClone(durable); other.payload.name = 'Other'; await repository.saveDraft(owner, other, durable);
    store.change('Unsaved local', store.value().content); expect(await store.flush()).toBe(false); expect(store.conflict()).toBe(true);
    expect(store.otherDraft()?.payload.name).toBe('Other'); expect(store.value().name).toBe('Unsaved local');
    const oldWeekId = store.value().content.weeks[0].id; await store.resolve('copy'); expect(await store.flush()).toBe(true);
    expect(store.value().content.weeks[0].id).not.toBe(oldWeekId); expect(await repository.listDrafts(owner)).toHaveLength(2);
    expect(await store.save()).toBe(true); expect((await repository.listDrafts(owner))[0].payload.name).toBe('Other');
  });
  it('cannot turn an archived routine into a saved edit and can recover a detached copy', async () => {
    const saved = await initial(); const fixture = await editor(owner, saved.planId); const store = fixture.componentInstance.store;
    store.change('Local edit', store.value().content); await repository.setArchived(owner, saved, true);
    expect(await store.save()).toBe(false); await store.resolve('mine'); expect(store.conflict()).toBe(true);
    await store.resolve('copy'); expect(await store.save()).toBe(true);
    const list = await repository.list(owner); expect(list).toHaveLength(2); expect(list.find(item => item.planId === saved.planId)?.archived).toBe(true);
  });
  it('retains draft and values after commit failure', async () => {
    const fixture = await editor(); const store = fixture.componentInstance.store; store.change('Keep me', routineFixture());
    const fail = vi.spyOn(repository, 'save').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    expect(await store.save()).toBe(false); expect(store.value().name).toBe('Keep me'); expect(await repository.listDrafts(owner)).toHaveLength(1);
    fail.mockRestore(); fixture.destroy(); const recovered = await editor(); expect(await recovered.componentInstance.store.save()).toBe(true);
  });
  it('duplicates weeks with unique native label targets and isolated nested input updates', async () => {
    const fixture = await editor(); const component = fixture.componentInstance; const store = component.store;
    store.change('Mixed', routineFixture()); fixture.detectChanges();
    component.act(store.value().content.weeks[0], 'duplicate'); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement; const ids = [...root.querySelectorAll('[id]')].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const label of root.querySelectorAll('label')) expect(label.control).not.toBeNull();
    const sets = fixture.debugElement.queryAll(By.directive(SetEditor)); expect(sets).toHaveLength(6);
    const duplicate = sets[3].componentInstance as SetEditor; duplicate.form.controls.minimum.setValue(10); fixture.detectChanges();
    const original = store.value().content.weeks[0].days[0].exercises[0].sets[0]; const copy = store.value().content.weeks[1].days[0].exercises[0].sets[0];
    expect('reps' in original && original.reps.minimum).toBe(8); expect('reps' in copy && copy.reps.minimum).toBe(10);
    expect(root.textContent).not.toContain('RPE'); expect(root.querySelectorAll('input[id$="-rir-input"]')).toHaveLength(2);
    expect(await store.flush()).toBe(true);
  });
  it.each<LoggingType>(['weight_reps', 'bodyweight_reps', 'assisted_bodyweight', 'duration', 'distance_duration'])('renders only appropriate native fields for %s', type => {
    const fixture = TestBed.createComponent(SetEditor); const value = newSet(type);
    fixture.componentRef.setInput('value', value); fixture.componentRef.setInput('position', 1); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const labels = [...root.querySelectorAll('label')].map(label => label.textContent!.trim());
    expect(labels.includes('Repeticiones mínimas')).toBe('reps' in value); expect(labels.includes('RIR objetivo')).toBe('reps' in value);
    expect(labels.includes('Asistencia (kg)')).toBe(type === 'assisted_bodyweight'); expect(labels.includes('Peso externo (kg)')).toBe(type === 'weight_reps');
    expect(labels.includes('Distancia (m)')).toBe(type === 'distance_duration'); expect(labels.includes('Duración (s)')).toBe('seconds' in value);
    for (const label of root.querySelectorAll('label')) expect(label.control).not.toBeNull();
  });
});
