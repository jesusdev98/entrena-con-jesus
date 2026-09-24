import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExerciseCatalogStore } from './exercise-catalog.store';
import { ExerciseCatalogPage } from './exercise-catalog-page';
import { ExercisePicker } from './exercise-picker';
import { ExerciseDetail } from './exercise-detail';
import { ExercisePosePair } from './exercise-pose-pair';
import { catalogChoice, customChoice } from './exercise-catalog.model';
import { exerciseCatalogFixture, exerciseFixture } from './exercise.fixtures';
import { CustomExercisesRepository } from './custom-exercises.repository';
import { WorkspaceStore } from '../people/workspace.store';
import { newId } from '../../core/domain/identity';
import { emptyProfile, type Person } from '../people/person.model';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('exercise loading and retry', () => {
  it('shows loading/error/retry in the page, then publishes only validated entries', async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }))
      .mockResolvedValueOnce(new Response(JSON.stringify(exerciseCatalogFixture())));
    vi.stubGlobal('fetch', fetch);
    const person: Person = { id: newId(), displayName: 'Alex', reference: '', kind: 'personal', archived: false, profile: emptyProfile(), createdAt: '', updatedAt: '' };
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: WorkspaceStore, useValue: { activePerson: signal(person), settings: signal({ mode: 'trainer' }) } },
      { provide: CustomExercisesRepository, useValue: { list: vi.fn().mockResolvedValue([]) } },
    ] });
    const store = TestBed.inject(ExerciseCatalogStore);
    const request = store.load();
    const fixture = TestBed.createComponent(ExerciseCatalogPage); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cargando catálogo');
    await store.load(); expect(fetch).toHaveBeenCalledTimes(1);
    resolve(new Response('{"version":2}')); await request; await fixture.whenStable(); fixture.detectChanges();
    expect(store.exercises()).toEqual([]);
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('validar');
    expect(fixture.nativeElement.querySelector('app-exercise-picker')).toBeNull();
    const retry = vi.spyOn(store, 'load');
    fixture.nativeElement.querySelector('.error button').click(); await retry.mock.results[0].value; fixture.detectChanges();
    expect(store.status()).toBe('ready'); expect(store.exercises()).toHaveLength(250);
    expect(fixture.nativeElement.textContent).toContain('250 ejercicios encontrados.');
    await store.load(); expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0].pathname).toContain('/catalogs/exercises.es.json');
    expect(fixture.nativeElement.querySelector('app-custom-exercise-editor')).toBeNull();
  });
  it('does not turn HTTP/network failures into a successful empty catalog', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 })).mockRejectedValueOnce(new TypeError('offline'));
    vi.stubGlobal('fetch', fetch);
    const store = TestBed.inject(ExerciseCatalogStore);
    await store.load(); expect(store.status()).toBe('error');
    await store.load(); expect(store.status()).toBe('error'); expect(store.error()).not.toBe(''); expect(store.exercises()).toEqual([]);
  });
  it('aborts a stalled request at the existing 15-second boundary and clears its timer', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url: URL, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetch);
    const store = TestBed.inject(ExerciseCatalogStore); const request = store.load();
    await vi.advanceTimersByTimeAsync(15000); await request;
    expect(store.status()).toBe('error'); expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('reusable exercise browse components', () => {
  it('excludes archived customs by default, filters their equipment and exposes recoverable archives explicitly', () => {
    const choice = customChoice({ id: newId(), personId: newId(), createdAt: '', updatedAt: '', name: 'Remo propio', category: 'strength', loggingType: 'weight_reps', instruction: '', equipment: ['Banda'], archived: true });
    const fixture = TestBed.createComponent(ExercisePicker); fixture.componentRef.setInput('exercises', [choice]); fixture.detectChanges();
    expect(fixture.componentInstance.filtered()).toEqual([]);
    fixture.componentRef.setInput('includeArchived', true); fixture.detectChanges();
    fixture.componentInstance.form.controls.equipment.setValue('Banda'); fixture.detectChanges();
    expect(fixture.componentInstance.filtered()).toEqual([choice]); expect(fixture.nativeElement.textContent).toContain('Personalizado · Archivado');
  });
  it('shows a custom placeholder, notes/equipment and no catalog media or credits', () => {
    const fixture = TestBed.createComponent(ExerciseDetail);
    fixture.componentRef.setInput('exercise', customChoice({ id: newId(), personId: newId(), createdAt: '', updatedAt: '', name: 'Remo', category: 'strength', loggingType: 'assisted_bodyweight', instruction: '', notes: 'Control', equipment: ['Banda'] })); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay ilustraciones asociadas.');
    expect(fixture.nativeElement.textContent).toContain('Banda'); expect(fixture.nativeElement.textContent).toContain('Control');
    expect(fixture.nativeElement.querySelectorAll('img, a')).toHaveLength(0);
  });
  it('labels filters, emits a native-button choice and resets an announced empty result', () => {
    const fixture = TestBed.createComponent(ExercisePicker); const exercise = catalogChoice(exerciseFixture());
    fixture.componentRef.setInput('exercises', [exercise]); fixture.detectChanges();
    const selected = vi.fn(); fixture.componentInstance.selected.subscribe(selected);
    for (const label of fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>) expect(label.control).not.toBeNull();
    const button = fixture.nativeElement.querySelector('article button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe(`Ver detalles de ${exercise.name}`);
    button.click(); expect(selected).toHaveBeenCalledWith(exercise);
    fixture.componentInstance.form.controls.equipment.setValue('Banco');
    fixture.componentInstance.form.controls.query.setValue('inexistente'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=status]').textContent).toContain('0 ejercicios');
    expect(fixture.nativeElement.querySelectorAll('article')).toHaveLength(0);
    fixture.nativeElement.querySelector('.notice button').click(); fixture.detectChanges();
    expect(fixture.componentInstance.form.getRawValue()).toEqual({ query: '', category: '', muscle: '', equipment: '' });
    expect(fixture.nativeElement.querySelectorAll('article')).toHaveLength(1);
  });
  it('displays Spanish instructions/equipment and keeps both frame credits distinct and ordered', () => {
    const fixture = TestBed.createComponent(ExerciseDetail); const entry = exerciseFixture();
    fixture.componentRef.setInput('exercise', catalogChoice(entry)); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(entry.instruction);
    expect(fixture.nativeElement.textContent).toContain('Barra, Banco');
    const figures = [...fixture.nativeElement.querySelectorAll('figure')] as HTMLElement[];
    expect(figures).toHaveLength(2);
    expect(figures.map(figure => figure.querySelector('img')?.getAttribute('src'))).toEqual(entry.media.frames.map(frame => frame.path));
    expect(figures.map(figure => figure.querySelector('img')?.alt)).toEqual(entry.media.frames.map(frame => `${entry.name} — ${frame.label}`));
    expect(figures[0].textContent).not.toContain('Adaptación directa');
    expect(figures[1].textContent).toContain('Adaptación directa');
    expect(figures[1].textContent).toContain('Tracing of this frame only.');
    for (const [index, figure] of figures.entries()) {
      expect(figure.querySelector(`a[href="${entry.media.frames[index].attribution.sourceUrl}"]`)).not.toBeNull();
      expect(figure.querySelector('a[href="https://creativecommons.org/licenses/by-sa/4.0/"]')).not.toBeNull();
      expect(figure.textContent).toContain('Collection foundation only'); expect(figure.textContent).toContain('SVG bytes unchanged.');
    }
  });
  it('retains static/partial semantics and presents an image error without losing labels or credits', () => {
    const fixture = TestBed.createComponent(ExercisePosePair); const entry = exerciseFixture();
    fixture.componentRef.setInput('name', entry.name);
    fixture.componentRef.setInput('media', { ...entry.media, mode: 'hold', semantics: 'static-references' }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Referencias estáticas');
    fixture.nativeElement.querySelector('img').dispatchEvent(new Event('error')); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Imagen no disponible');
    expect(fixture.nativeElement.textContent).toContain('1. Barra cerca del pecho');
    expect(fixture.nativeElement.querySelector('figure a[href="https://creativecommons.org/licenses/by-sa/4.0/"]')).not.toBeNull();
    fixture.componentRef.setInput('media', { ...entry.media, mode: 'cycle', semantics: 'partial-sequence' }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Secuencia parcial');
  });
});
