import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { newId, type UUID } from '../../core/domain/identity';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { DraftsRepository } from '../../core/storage/drafts.repository';
import { WorkspaceStore } from '../people/workspace.store';
import { PeopleRepository } from '../people/people.repository';
import { emptyProfile } from '../people/person.model';
import { CustomExerciseEditor } from './custom-exercise-editor';
import { CustomExercisesRepository } from './custom-exercises.repository';
import type { CustomExerciseFormValue } from './exercise.model';

describe('custom exercise editor drafts and transitions', () => {
  let database: Database; let workspace: WorkspaceStore; let owner: UUID; let repository: CustomExercisesRepository;
  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [CustomExerciseEditor], providers: [{ provide: DATABASE_NAME, useValue: `exercise-editor-${newId()}` }] });
    database = TestBed.inject(Database); workspace = TestBed.inject(WorkspaceStore); repository = TestBed.inject(CustomExercisesRepository);
    await workspace.initialize(); await workspace.changeMode('trainer'); owner = workspace.activePerson()!.id;
  });
  afterEach(async () => { TestBed.resetTestingModule(); vi.restoreAllMocks(); database.close(); await deleteDB(database.name); });
  async function editor(person = owner, exercise?: UUID) {
    const fixture = TestBed.createComponent(CustomExerciseEditor);
    fixture.componentRef.setInput('personId', person); fixture.componentRef.setInput('exerciseId', exercise); fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges(); return fixture;
  }
  const values: Required<CustomExerciseFormValue> = { name: 'Remo propio', category: 'strength', loggingType: 'weight_reps', instruction: 'Controlar el movimiento', notes: 'Nota propia', equipment: 'Banda' };
  it('labels every field, recovers incomplete values after reopening and commits a single record', async () => {
    const first = await editor();
    for (const label of first.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>) expect(label.control).not.toBeNull();
    first.componentInstance.form.controls.name.setValue('Borrador');
    expect(await first.componentInstance.flush()).toBe(true); first.destroy(); database.close();
    const second = await editor(); expect(second.componentInstance.form.controls.name.value).toBe('Borrador');
    expect(second.componentInstance.form.controls.category.value).toBe(''); expect(second.componentInstance.form.controls.loggingType.value).toBe('');
    second.componentInstance.form.setValue(values); await second.componentInstance.save(); await second.componentInstance.save();
    const saved = await repository.list(owner); expect(saved).toHaveLength(1); expect(saved[0].equipment).toEqual(['Banda']);
    expect(await TestBed.inject(DraftsRepository).find(owner, 'custom-exercise:new')).toBeUndefined();
  });
  it('blocks mode changes when draft persistence fails and supports retry without data loss', async () => {
    const fixture = await editor();
    const fail = vi.spyOn(TestBed.inject(DraftsRepository), 'save').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    fixture.componentInstance.form.setValue(values);
    expect(await workspace.changeMode('client')).toBe(false); expect(workspace.settings()?.mode).toBe('trainer');
    expect(fixture.componentInstance.form.getRawValue()).toEqual(values); expect(fixture.componentInstance.error()).toContain('espacio');
    fail.mockRestore(); expect(await TestBed.inject(DraftCoordinator).flush()).toBe(true);
    await fixture.componentInstance.save(); expect(await repository.list(owner)).toHaveLength(1);
  });
  it('flushes drafts for same-name people and modes without cross-person commits', async () => {
    const people = TestBed.inject(PeopleRepository); const firstId = newId(); const secondId = newId();
    for (const id of [firstId, secondId]) await people.savePerson(id, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null);
    await workspace.refresh(); await workspace.selectPerson(firstId);
    const first = await editor(firstId); first.componentInstance.form.setValue({ ...values, name: 'Solo primero' });
    expect(await workspace.selectPerson(secondId)).toBe(true);
    await first.componentInstance.save(); expect(first.componentInstance.error()).toContain('persona activa cambió'); first.destroy();
    const second = await editor(secondId); expect(second.componentInstance.form.controls.name.value).toBe('');
    second.componentInstance.form.controls.name.setValue('Solo segundo');
    expect(await workspace.changeMode('client')).toBe(true); second.destroy();
    const personal = await editor(owner); expect(personal.componentInstance.form.controls.name.value).toBe(''); personal.destroy();
    expect(await workspace.changeMode('trainer')).toBe(true);
    const returned = await editor(secondId); expect(returned.componentInstance.form.controls.name.value).toBe('Solo segundo'); returned.destroy();
    await workspace.selectPerson(firstId); const recovered = await editor(firstId); expect(recovered.componentInstance.form.controls.name.value).toBe('Solo primero');
    expect(await repository.list(firstId)).toEqual([]); expect(await repository.list(secondId)).toEqual([]);
  });
  it('retains a failed commit draft and visibly rejects missing required fields', async () => {
    const fixture = await editor(); await fixture.componentInstance.save(); expect(fixture.componentInstance.error()).toContain('Revisa');
    for (const change of [{ name: '   ' }, { category: '' as const }, { loggingType: '' as const }]) {
      fixture.componentInstance.form.setValue({ ...values, ...change }); await fixture.componentInstance.save(); expect(await repository.list(owner)).toEqual([]);
    }
    fixture.componentInstance.form.setValue(values);
    const fail = vi.spyOn(repository, 'save').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    await fixture.componentInstance.save(); expect(fixture.componentInstance.error()).toContain('espacio');
    expect(fixture.componentInstance.form.getRawValue()).toEqual(values); expect(fixture.componentInstance.saving()).toBe(false);
    fail.mockRestore(); fixture.destroy();
    const recovered = await editor(); expect(recovered.componentInstance.form.getRawValue()).toEqual(values);
    await recovered.componentInstance.save(); expect(await repository.list(owner)).toHaveLength(1);
  });
  it.each([true, false])('requires explicit concurrent-edit comparison (keep draft: %s)', async keepDraft => {
    const initial = await editor(); initial.componentInstance.form.setValue(values); await initial.componentInstance.save(); initial.destroy();
    const original = (await repository.list(owner))[0]; const edit = await editor(owner, original.id);
    edit.componentInstance.form.controls.name.setValue('Mi borrador'); await edit.componentInstance.flush();
    await (await database.open()).put('customExercises', { ...original, name: 'Otra pestaña', updatedAt: new Date(Date.parse(original.updatedAt) + 100).toISOString() });
    await edit.componentInstance.save(); edit.detectChanges();
    expect(edit.componentInstance.conflict()).toBe(true); expect(edit.componentInstance.currentExercise()?.name).toBe('Otra pestaña');
    expect(edit.nativeElement.textContent).toContain('Compara antes de guardar');
    await edit.componentInstance.resolveConflict(keepDraft); await edit.componentInstance.save();
    expect((await repository.list(owner))[0].name).toBe(keepDraft ? 'Mi borrador' : 'Otra pestaña');
  });
  it('does not resolve a concurrently archived entry into an editable record', async () => {
    const initial = await editor(); initial.componentInstance.form.setValue(values); await initial.componentInstance.save(); initial.destroy();
    const original = (await repository.list(owner))[0]; const edit = await editor(owner, original.id);
    edit.componentInstance.form.controls.notes.setValue('Unfinished'); await repository.setArchived(owner, original, true);
    await edit.componentInstance.save(); await edit.componentInstance.resolveConflict(true);
    expect(edit.componentInstance.conflict()).toBe(true); expect(edit.componentInstance.error()).toContain('archivados');
    expect(await TestBed.inject(DraftsRepository).find(owner, `custom-exercise:${original.id}`)).toBeDefined();
  });
});
