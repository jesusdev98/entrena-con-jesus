import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, DATABASE_NAME } from '../../core/storage/database';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { localDate, newId, type UUID } from '../../core/domain/identity';
import { PeopleRepository } from '../people/people.repository';
import { WorkspaceStore } from '../people/workspace.store';
import { emptyProfile } from '../people/person.model';
import { NumericValue } from '../../shared/ui/numeric-value';
import { ActivityEditor } from './activity-editor';
import { DailyTargetRepository } from './daily-target.repository';
import { actualActivity, activityCatalog, activityProfile } from './activity.fixtures';
import { sessionFixture } from '../training/training.fixtures';
import { ActivityGroupEditor } from './activity-group-editor';

describe('owner-bound daily activity editor', () => {
  let database: Database, repository: DailyTargetRepository, workspace: WorkspaceStore, owner: UUID;
  const date = localDate('2026-01-01');
  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [ActivityEditor], providers: [provideRouter([]), { provide: DATABASE_NAME, useValue: `activity-editor-${newId()}` }] });
    database = TestBed.inject(Database); repository = TestBed.inject(DailyTargetRepository); workspace = TestBed.inject(WorkspaceStore);
    await workspace.initialize(); await workspace.changeMode('trainer'); owner = workspace.activePerson()!.id;
    const person = workspace.activePerson()!;
    await TestBed.inject(PeopleRepository).savePerson(owner, { displayName: 'Alex', reference: '', profile: activityProfile() }, person.updatedAt); await workspace.refresh();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => activityCatalog }));
  });
  afterEach(async () => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); database.close(); await deleteDB(database.name); });
  async function editor() {
    const fixture = TestBed.createComponent(ActivityEditor); fixture.componentRef.setInput('person', workspace.activePerson()); fixture.componentRef.setInput('date', date); fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.store.busy()).toBe(false)); fixture.detectChanges(); return fixture;
  }
  it('recovers incomplete nullable drafts after reload without publishing them', async () => {
    const fixture = await editor(), store = fixture.componentInstance.store;
    const value = actualActivity(); value.work.actual!.blocks[0].minutes = null; store.change(value); expect(await store.flush()).toBe(true);
    await store.save(); expect(await repository.get(owner, date)).toBeNull(); fixture.destroy(); database.close();
    const recovered = await editor(); expect(recovered.componentInstance.store.draft()!.payload.value.work.actual!.blocks[0].minutes).toBeNull();
    expect(recovered.nativeElement.textContent).toContain('duración');
  });
  it('renders live engine results for deficit, surplus and valid custom percentages', async () => {
    const fixture = await editor(), component = fixture.componentInstance; component.store.change(actualActivity()); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="target-kcal"]').textContent).toContain('2,719.97');
    component.patch({ goal: 'gain', adjustmentKcal: 450 }); component.macro('protein', 30); fixture.detectChanges();
    expect(component.store.calculation().value).toBeNull(); component.macro('carbohydrate', 45); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="target-kcal"]').textContent).toContain('3,469.97');
    await component.store.save(); expect((await repository.get(owner, date))!.calculation.input.macroPercentages).toEqual({ protein: 30, carbohydrate: 45, fat: 25 });
  });
  it('uses the shared nullable number control and unique native label targets', async () => {
    const fixture = await editor(); fixture.componentInstance.store.change(actualActivity()); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement, ids = [...root.querySelectorAll('[id]')].map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length); for (const label of root.querySelectorAll('label')) expect(label.control).not.toBeNull();
    const numeric = fixture.debugElement.queryAll(By.directive(NumericValue)).map(n => n.componentInstance as NumericValue).find(n => n.fieldId() === 'actual-total')!;
    numeric.control.setValue(0); expect(fixture.componentInstance.store.calculation().error).toContain('pasos totales');
    numeric.control.setValue(null); expect(fixture.componentInstance.store.draft()!.payload.value.totalSteps.actual).toBeNull();
    await fixture.componentInstance.store.flush();
  });
  it('blocks person and mode transitions after failed writes and retains local input for retry', async () => {
    const fixture = await editor(), store = fixture.componentInstance.store, other = newId();
    await TestBed.inject(PeopleRepository).savePerson(other, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null); await workspace.refresh();
    const fail = vi.spyOn(repository, 'saveDraft').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    store.change(actualActivity()); expect(await workspace.selectPerson(other)).toBe(false); expect(await workspace.changeMode('client')).toBe(false);
    expect(store.draft()!.payload.value.adjustmentKcal).toBe(300); expect(store.error()).toContain('espacio');
    fail.mockRestore(); expect(await TestBed.inject(DraftCoordinator).flush()).toBe(true);
  });
  it('flushes changes to the original owner and rejects commits after same-name person switching', async () => {
    const fixture = await editor(), store = fixture.componentInstance.store, other = newId();
    await TestBed.inject(PeopleRepository).savePerson(other, { displayName: 'Alex', reference: '', profile: emptyProfile() }, null); await workspace.refresh();
    store.change(actualActivity()); expect(await workspace.selectPerson(other)).toBe(true); await store.save();
    expect(store.error()).toContain('persona'); expect(await repository.get(owner, date)).toBeNull(); expect(await repository.draft(other, date)).toBeNull();
    expect((await repository.draft(owner, date))!.payload.value.adjustmentKcal).toBe(300);
  });
  it('retains failed commits and publishes only after a successful retry', async () => {
    const fixture = await editor(), store = fixture.componentInstance.store; store.change(actualActivity());
    const fail = vi.spyOn(repository, 'save').mockRejectedValue(new DOMException('Full', 'QuotaExceededError')); await store.save();
    expect(await repository.get(owner, date)).toBeNull(); expect(await repository.draft(owner, date)).not.toBeNull(); expect(repository.committed()).toBeNull();
    fail.mockRestore(); await store.save(); expect((await repository.get(owner, date))!.version).toBe(1);
  });
  it('shows local and durable comparisons after another tab saves, then recovers explicitly', async () => {
    const fixture = await editor(), store = fixture.componentInstance.store; store.change(actualActivity()); await store.flush();
    const durable = (await repository.draft(owner, date))!, remote = structuredClone(durable); remote.payload.value.adjustmentKcal = 450;
    await repository.saveDraft(owner, remote, durable); await repository.save(owner, remote);
    store.change({ ...store.draft()!.payload.value, adjustmentKcal: 321 }); expect(await store.flush()).toBe(false); fixture.detectChanges();
    expect(store.conflict()).toBe(true); expect(fixture.nativeElement.textContent).toContain('321'); expect(fixture.nativeElement.textContent).toContain('450');
    const comparison = fixture.nativeElement.querySelector('[aria-label="Comparación de actividad"]').textContent as string;
    expect(comparison).toContain('Mis datos locales'); expect(comparison).toContain('Datos guardados');
    expect(comparison).not.toContain(durable.id); expect(comparison).not.toContain(owner);
    await store.save(); expect((await repository.get(owner, date))!.activity.adjustmentKcal).toBe(450);
    await store.recover(); expect(store.draft()!.payload.value.adjustmentKcal).toBe(450); expect(store.conflict()).toBe(false);
    store.change({ ...store.draft()!.payload.value, adjustmentKcal: 400 }); await store.save(); expect((await repository.get(owner, date))!.version).toBe(2);
  });
  it('blocks recovery until both comparison reads succeed', async () => {
    const fixture = await editor(), store = fixture.componentInstance.store;
    const fail = vi.spyOn(repository, 'get').mockRejectedValue(new Error('Unavailable')); await store.readConflict();
    expect(store.comparisonReady()).toBe(false); const recover = vi.spyOn(repository, 'recover'); await store.recover(); expect(recover).not.toHaveBeenCalled();
    fail.mockRestore(); await store.readConflict(); expect(store.comparisonReady()).toBe(true); await store.recover();
  });
  it('offers profile completion and full manual TDEE for an incomplete profile', async () => {
    const person = workspace.activePerson()!; await TestBed.inject(PeopleRepository).savePerson(owner, { displayName: 'Alex', reference: '', profile: emptyProfile() }, person.updatedAt); await workspace.refresh();
    const fixture = await editor(), component = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Completar perfil');
    component.patch({ mode: 'manual-tdee', manualKcal: 2100, manualReason: 'Gasto indicado' }); await component.store.save();
    expect((await repository.get(owner, date))!.calculation.result.targetKcal).toBe(2100);
  });
  it('filters sourced MET choices by captured age and prevents duplicate stable-session selection', async () => {
    const person = workspace.activePerson()!; await TestBed.inject(PeopleRepository).savePerson(owner, { displayName: 'Alex', reference: '', profile: { ...activityProfile(), age: 65 } }, person.updatedAt); await workspace.refresh();
    const session = { ...sessionFixture(owner), status: 'completed' as const, durationMinutes: 30, durationSource: 'manual' as const }; await (await database.open()).put('trainingSessions', session);
    const fixture = await editor(), component = fixture.componentInstance;
    expect(component.eligible().every(met => met.table === 'older-adult' && met.referenceMlO2PerKgMin === 2.7)).toBe(true);
    component.group('training', 'actual', { blocks: [], includedSteps: 0 }); fixture.detectChanges();
    const group = fixture.debugElement.queryAll(By.directive(ActivityGroupEditor)).map(n => n.componentInstance as ActivityGroupEditor).find(g => g.key() === 'training-actual')!;
    group.link(session.id); fixture.detectChanges(); expect(group.available()).toEqual([]); group.link(session.id);
    expect(component.store.draft()!.payload.value.training.actual!.blocks).toHaveLength(1); await component.store.flush();
  });
  it('retries failed catalog loading without creating an incomplete context', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Sin catálogo')); const fixture = await editor();
    expect(fixture.componentInstance.store.draft()).toBeNull(); expect(fixture.nativeElement.textContent).toContain('Reintentar carga');
    await fixture.componentInstance.store.initialize(owner, date); expect(fixture.componentInstance.store.draft()).not.toBeNull();
  });
});
