import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { localDate, newId, type UUID } from '../../core/domain/identity';
import { PeopleRepository } from '../people/people.repository';
import { WorkspaceStore } from '../people/workspace.store';
import { emptyProfile } from '../people/person.model';
import { RoutinesRepository } from '../routines/routines.repository';
import { routineDraft } from '../routines/routine.fixtures';
import { TrainingRepository } from './training.repository';
import { TrainingEditor } from './training-editor';
import { ActualSetEditor } from './actual-set-editor';
import { performed, sessionFixture } from './training.fixtures';
import { blankPerformance } from './training-domain';
import type { Performance } from './training.model';

describe('owner-bound training editor recovery', () => {
  let database: Database; let repository: TrainingRepository; let workspace: WorkspaceStore; let owner: UUID;
  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [TrainingEditor], providers: [{ provide: DATABASE_NAME, useValue: `training-editor-${newId()}` }] });
    database = TestBed.inject(Database); repository = TestBed.inject(TrainingRepository); workspace = TestBed.inject(WorkspaceStore);
    await workspace.initialize(); await workspace.changeMode('trainer'); owner = workspace.activePerson()!.id;
  });
  afterEach(async () => { TestBed.resetTestingModule(); vi.restoreAllMocks(); database.close(); await deleteDB(database.name); });
  async function start(person = owner) {
    const routines = TestBed.inject(RoutinesRepository); const plan = routineDraft(person); await routines.saveDraft(person, plan, null); const revision = await routines.save(person, plan); const week = revision.content.weeks[0];
    return repository.start(person, revision.id, week.id, week.days[0].id, localDate('2026-01-01'));
  }
  async function editor(id: UUID, person = owner) {
    const fixture = TestBed.createComponent(TrainingEditor); fixture.componentRef.setInput('personId', person); fixture.componentRef.setInput('sessionId', id); fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.store.value()).not.toBeNull()); fixture.detectChanges(); return fixture;
  }
  it('recovers incomplete actual fields after editor/database restart without silently completing them', async () => {
    const draft = await start(); const fixture = await editor(draft.payload.session.id); const store = fixture.componentInstance.store;
    const child = fixture.debugElement.query(By.directive(ActualSetEditor)).componentInstance as ActualSetEditor;
    child.form.controls.weightKg.setValue(17.25); expect(await store.flush()).toBe(true); expect(await store.save()).toBe(false);
    expect(await repository.list(owner)).toEqual([]); fixture.destroy(); database.close(); const recovered = await editor(draft.payload.session.id);
    const set = recovered.componentInstance.store.value()!.exercises[0].sets[0];
    expect(set).toMatchObject({ status: 'draft', actual: { weightKg: 17.25, reps: null }, rpe: null });
    expect(recovered.nativeElement.textContent).toContain('Borrador recuperado');
  });
  it('blocks person and mode transitions after failed draft writes, preserving typed inputs for retry', async () => {
    const draft = await start(); const fixture = await editor(draft.payload.session.id); const store = fixture.componentInstance.store;
    const people = TestBed.inject(PeopleRepository); const other = newId(); await people.savePerson(other, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null); await workspace.refresh();
    const fail = vi.spyOn(repository, 'saveDraft').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    store.change({ ...store.value()!, notes: 'Keep actual values' });
    expect(await workspace.selectPerson(other)).toBe(false); expect(await workspace.changeMode('client')).toBe(false);
    expect(store.value()!.notes).toBe('Keep actual values'); expect(store.error()).toContain('espacio');
    fail.mockRestore(); expect(await TestBed.inject(DraftCoordinator).flush()).toBe(true);
    expect((await repository.listDrafts(owner))[0].payload.session.notes).toBe('Keep actual values');
  });
  it('flushes to original owner through same-name person/mode transitions and rejects commits outside that context', async () => {
    const people = TestBed.inject(PeopleRepository); const a = newId(); const b = newId();
    for (const id of [a, b]) await people.savePerson(id, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null);
    await workspace.refresh(); await workspace.selectPerson(a); const draft = await start(a); const fixture = await editor(draft.payload.session.id, a); const store = fixture.componentInstance.store;
    store.change(performed(store.value()!)); expect(await workspace.selectPerson(b)).toBe(true); expect(await store.save()).toBe(false); expect(store.error()).toContain('persona activa cambió'); fixture.destroy();
    expect(await repository.listDrafts(b)).toEqual([]); await workspace.changeMode('client'); expect(await repository.listDrafts(owner)).toEqual([]);
    await workspace.changeMode('trainer'); await workspace.selectPerson(a); const recovered = await editor(draft.payload.session.id, a);
    expect(recovered.componentInstance.store.value()!.exercises[0].sets[0].actual).toMatchObject({ weightKg: 12.5 });
    expect(await recovered.componentInstance.store.save()).toBe(true); expect(await repository.list(b)).toEqual([]);
  });
  it('retains a failed commit and allows exactly one final save after recovery', async () => {
    const draft = await start(); const fixture = await editor(draft.payload.session.id); const store = fixture.componentInstance.store; store.change(performed(store.value()!));
    const fail = vi.spyOn(repository, 'save').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    expect(await store.save()).toBe(false); expect(await repository.listDrafts(owner)).toHaveLength(1); expect(await repository.list(owner)).toEqual([]);
    fail.mockRestore(); expect(await store.save()).toBe(true); expect(await store.save()).toBe(false); expect(await repository.list(owner)).toHaveLength(1);
  });
  it('shows local/durable values after another tab commits, blocks overwrite and explicitly recovers a correction', async () => {
    const draft = await start(); const fixture = await editor(draft.payload.session.id); const store = fixture.componentInstance.store; store.change(performed(store.value()!)); await store.flush();
    const durable = (await repository.listDrafts(owner))[0]; const remote = structuredClone(durable); remote.payload.session.notes = 'Remote committed';
    await repository.saveDraft(owner, remote, durable); const saved = await repository.save(owner, remote);
    store.change({ ...store.value()!, notes: 'Unsaved local' }); expect(await store.flush()).toBe(false); fixture.detectChanges();
    expect(store.conflict()).toBe(true); expect(fixture.nativeElement.textContent).toContain('Unsaved local'); expect(fixture.nativeElement.textContent).toContain('Remote committed');
    expect(await store.save()).toBe(false); await store.recover(); expect(store.value()!.notes).toBe('Remote committed'); expect(store.conflict()).toBe(false);
    store.change({ ...store.value()!, notes: 'Reviewed correction' }); expect(await store.save()).toBe(true);
    expect(await repository.list(owner)).toHaveLength(1); expect(await repository.get(owner, saved.id)).toMatchObject({ notes: 'Reviewed correction', version: 2 });
  });
  it('recovers a stale saved base explicitly without trapping the correction in repeated conflicts', async () => {
    const draft = await start(); const filled = structuredClone(draft); filled.payload.session = performed(filled.payload.session); await repository.saveDraft(owner, filled, draft); const saved = await repository.save(owner, filled);
    await repository.reopen(owner, saved.id); await (await database.open()).put('trainingSessions', { ...saved, notes: 'New base', version: 2 });
    const fixture = await editor(saved.id); const store = fixture.componentInstance.store; await vi.waitFor(() => expect(store.conflict()).toBe(true));
    await store.recover(); expect(store.value()!.notes).toBe('New base'); expect(await store.save()).toBe(true);
  });
  it('renders unique native labels and requires explicit completion with real effort', async () => {
    const draft = await start(); const fixture = await editor(draft.payload.session.id); const root = fixture.nativeElement as HTMLElement;
    const ids = [...root.querySelectorAll('[id]')].map(node => node.id); expect(new Set(ids).size).toBe(ids.length);
    const labels = [...root.querySelectorAll('label')]; expect(new Set(labels.map(label => label.textContent)).size).toBe(labels.length);
    for (const label of labels) expect(label.control).not.toBeNull();
    const child = fixture.debugElement.query(By.directive(ActualSetEditor)).componentInstance as ActualSetEditor;
    child.form.controls.weightKg.setValue(0); child.form.controls.reps.setValue(8); child.done(); expect(child.error()).toContain('RPE');
    child.form.controls.rpe.setValue(7.5); child.done(); expect(fixture.componentInstance.store.value()!.exercises[0].sets[0]).toMatchObject({ status: 'completed', rpe: 7.5 });
    expect(await fixture.componentInstance.store.flush()).toBe(true);
  });
  it.each<Performance['type']>(['weight-reps', 'bodyweight-reps', 'assisted-reps', 'duration', 'distance-duration'])('renders only applicable actual controls for %s', type => {
    const fixture = TestBed.createComponent(ActualSetEditor); const set = sessionFixture().exercises[0].sets[0];
    fixture.componentRef.setInput('value', { ...set, actual: blankPerformance(type) }); fixture.componentRef.setInput('type', type); fixture.componentRef.setInput('label', 'serie 1, ejercicio 1'); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement; const text = root.textContent!;
    expect(text.includes('RIR real')).toBe(type.endsWith('reps')); expect(text.includes('Asistencia real (kg)')).toBe(type === 'assisted-reps');
    expect(text.includes('Peso real (kg)')).toBe(type === 'weight-reps'); expect(text.includes('Distancia real (m)')).toBe(type === 'distance-duration');
    expect(root.querySelectorAll('label').length).toBeGreaterThan(0); for (const label of root.querySelectorAll('label')) expect(label.control).not.toBeNull();
  });
});
