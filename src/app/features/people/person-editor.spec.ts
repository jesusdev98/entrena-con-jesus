import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonEditor } from './person-editor';
import { WorkspaceStore } from './workspace.store';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { DraftsRepository } from '../../core/storage/drafts.repository';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { newId } from '../../core/domain/identity';
import { PeopleRepository } from './people.repository';

describe('person draft recovery', () => {
  let database: Database;
  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [PersonEditor], providers: [{ provide: DATABASE_NAME, useValue: `editor-${newId()}` }] });
    database = TestBed.inject(Database);
    await TestBed.inject(WorkspaceStore).initialize();
    await TestBed.inject(WorkspaceStore).changeMode('trainer');
  });
  afterEach(async () => { vi.restoreAllMocks(); database.close(); await deleteDB(database.name); });

  it('keeps unsaved form values on quota failure and blocks transitions until retry succeeds', async () => {
    const fixture = TestBed.createComponent(PersonEditor);
    fixture.detectChanges(); await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    const save = vi.spyOn(TestBed.inject(DraftsRepository), 'save').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    fixture.componentInstance.form.controls.displayName.setValue('Ana pendiente');
    expect(await TestBed.inject(DraftCoordinator).flush()).toBe(false);
    expect(fixture.componentInstance.form.controls.displayName.value).toBe('Ana pendiente');
    expect(fixture.componentInstance.error()).toContain('espacio');
    expect(TestBed.inject(WorkspaceStore).people()).toHaveLength(1);
    save.mockRestore();
    expect(await TestBed.inject(DraftCoordinator).flush()).toBe(true);
    await fixture.componentInstance.save();
    expect(TestBed.inject(WorkspaceStore).people().map(person => person.displayName)).toContain('Ana pendiente');
  });

  it('recovers the draft and stable subject ID when the editor is recreated', async () => {
    const first = TestBed.createComponent(PersonEditor);
    first.detectChanges(); await first.whenStable();
    await vi.waitFor(() => expect(first.componentInstance.loading()).toBe(false));
    first.componentInstance.form.controls.displayName.setValue('Alex');
    first.componentInstance.form.controls.reference.setValue('Turno tarde');
    await first.componentInstance.flush();
    const id = first.componentInstance.identity();
    first.destroy();
    const second = TestBed.createComponent(PersonEditor);
    second.detectChanges(); await second.whenStable();
    await vi.waitFor(() => expect(second.componentInstance.loading()).toBe(false));
    expect(second.componentInstance.identity()).toBe(id);
    expect(second.componentInstance.form.controls.reference.value).toBe('Turno tarde');
    expect(second.componentInstance.draftStatus()).toContain('recuperado');
  });

  it('rejects blank required names while preserving editable form values', async () => {
    const fixture = TestBed.createComponent(PersonEditor);
    fixture.detectChanges(); await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.error()).toContain('Revisa');
    expect(TestBed.inject(WorkspaceStore).people()).toHaveLength(1);
  });

  it.each([true, false])('requires an explicit stale-profile choice (keep draft: %s)', async keepDraft => {
    const workspace = TestBed.inject(WorkspaceStore);
    const original = workspace.personalPerson()!;
    const fixture = TestBed.createComponent(PersonEditor);
    fixture.componentRef.setInput('personId', original.id);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.componentInstance.form.controls.displayName.setValue('My draft');
    await fixture.componentInstance.flush();
    await TestBed.inject(PeopleRepository).savePerson(original.id, { ...original, displayName: 'Other tab' }, original.updatedAt);
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.conflict()).toBe(true);
    expect(fixture.componentInstance.currentProfile()?.displayName).toBe('Other tab');
    expect(workspace.personalPerson()?.displayName).toBe('Other tab');
    await fixture.componentInstance.resolveConflict(keepDraft);
    await fixture.componentInstance.save();
    expect(workspace.personalPerson()?.displayName).toBe(keepDraft ? 'My draft' : 'Other tab');
    expect(fixture.componentInstance.error()).toBe('');
  });
});
