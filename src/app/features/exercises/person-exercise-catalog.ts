import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { Button } from '../../shared/ui/button';
import { storageFailure } from '../../core/storage/database';
import type { Person } from '../people/person.model';
import type { UUID } from '../../core/domain/identity';
import type { CustomExercise } from './exercise.model';
import { ExerciseCatalogStore } from './exercise-catalog.store';
import { CustomExercisesRepository } from './custom-exercises.repository';
import { CustomExerciseEditor } from './custom-exercise-editor';
import { ExercisePicker } from './exercise-picker';
import { ExerciseDetailDialog, type ExerciseDetailAction } from './exercise-detail-dialog';
import { catalogChoice, customChoice, type ExerciseChoice } from './exercise-catalog.model';

@Component({ selector: 'app-person-exercise-catalog', imports: [ReactiveFormsModule, Button, ExercisePicker, CustomExerciseEditor],
  changeDetection: ChangeDetectionStrategy.OnPush, template: `<div class="stack">
    <section class="notice" aria-label="Persona del catálogo"><h2>Ejercicios personalizados de {{ person().displayName }}</h2>
      <p>{{ person().reference || 'Espacio local' }}</p><p class="identity">ID de la persona: {{ person().id }}</p>
      <button #newButton appButton [disabled]="editor() !== null || loading() || busy()" (click)="editor.set('new')">Añadir ejercicio personalizado</button>
      <p class="muted">Este botón también recupera el borrador de un ejercicio nuevo.</p></section>
    @if (message()) { <p role="status">{{ message() }}</p> }
    @if (error()) { <div class="error" role="alert"><p>{{ error() }}</p><button appButton variant="secondary" (click)="loadCustom()">Reintentar lectura de personalizados</button></div> }
    @if (loading()) { <p role="status">Cargando ejercicios de esta persona…</p> }
    @for (key of editor() === null ? [] : [editor()]; track key) {
      <app-custom-exercise-editor [personId]="person().id" [exerciseId]="key === 'new' ? undefined : asId(key)" (saved)="onSaved()" (closed)="closeEditor()" />
    }
    @if (editor() === null) {
      <div class="field"><label for="exercise-origin">Origen</label><select id="exercise-origin" [formControl]="originControl">
        <option value="all">Todos los ejercicios activos</option><option value="catalog">Catálogo ilustrado · 250 ejercicios</option>
        <option value="custom">Personalizados de esta persona</option><option value="archived">Archivados de esta persona</option>
      </select></div>
      @if (catalog.status() === 'loading' || catalog.status() === 'idle') { <p role="status">Cargando catálogo local de ejercicios…</p> }
      @if (catalog.error()) { <div class="error" role="alert"><p>{{ catalog.error() }}</p><button appButton variant="secondary" (click)="catalog.load()">Reintentar catálogo de ejercicios</button></div> }
      @if (canBrowse()) {
        @for (source of [origin()]; track source) { <app-exercise-picker [exercises]="choices()" [includeArchived]="source === 'archived'" (selected)="showDetail($event)" /> }
      }
    }
  </div>`, styles: `:host { display: block; min-width: 0; } .notice p:last-child { margin: .75rem 0 0; } select { max-width: 100%; }` })
export class PersonExerciseCatalog implements OnInit {
  readonly person = input.required<Person>();
  protected readonly catalog = inject(ExerciseCatalogStore);
  private readonly repository = inject(CustomExercisesRepository);
  private readonly dialog = inject(Dialog);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly newButton = viewChild<ElementRef<HTMLButtonElement>>('newButton');
  readonly exercises = signal<CustomExercise[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly message = signal('');
  readonly busy = signal(false);
  readonly editor = signal<UUID | 'new' | null>(null);
  readonly originControl = new FormControl('all', { nonNullable: true });
  readonly origin = toSignal(this.originControl.valueChanges, { initialValue: 'all' });
  private owner!: UUID;
  private loadVersion = 0;
  private detailOpen = false;
  protected readonly canBrowse = computed(() => this.origin() === 'catalog' ? this.catalog.status() === 'ready' :
    this.origin() === 'all' ? this.catalog.status() === 'ready' && !this.loading() && !this.error() : !this.loading() && !this.error());
  readonly choices = computed(() => {
    const origin = this.origin();
    const standard = origin === 'all' || origin === 'catalog' ? this.catalog.exercises().map(catalogChoice) : [];
    const custom = origin === 'catalog' ? [] : this.exercises().filter(exercise => !!exercise.archived === (origin === 'archived')).map(customChoice);
    return [...standard, ...custom];
  });
  ngOnInit(): void { this.owner = this.person().id; void this.loadCustom(); void this.catalog.load(); }
  protected asId(value: UUID | 'new' | null): UUID | undefined { return value && value !== 'new' ? value : undefined; }
  async loadCustom(): Promise<void> {
    const version = ++this.loadVersion;
    this.loading.set(true);
    this.error.set('');
    try { const exercises = await this.repository.list(this.owner); if (!this.destroy.destroyed && version === this.loadVersion) this.exercises.set(exercises); }
    catch (error) { if (version === this.loadVersion) { this.exercises.set([]); this.error.set(storageFailure(error).message); } }
    finally { if (version === this.loadVersion) this.loading.set(false); }
  }
  async showDetail(exercise: ExerciseChoice): Promise<void> {
    if (this.busy() || this.detailOpen) return;
    this.detailOpen = true;
    const ref = this.dialog.open<ExerciseDetailAction>(ExerciseDetailDialog, { data: exercise, ariaLabelledBy: 'exercise-detail-title' });
    const unregister = this.destroy.onDestroy(() => ref.close());
    let action: ExerciseDetailAction | undefined;
    try { action = await firstValueFrom(ref.closed); }
    finally { unregister(); this.detailOpen = false; }
    if (this.destroy.destroyed || exercise.kind !== 'custom' || !action) return;
    if (action === 'edit') { this.editor.set(exercise.entry.id); return; }
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await this.repository.setArchived(this.owner, exercise.entry, action === 'archive');
      if (this.destroy.destroyed) return;
      await this.loadCustom();
      this.message.set(action === 'archive' ? 'Ejercicio archivado. Puedes restaurarlo desde el origen Archivados.' : 'Ejercicio restaurado.');
      this.focusCreate();
    } catch (error) { this.error.set(storageFailure(error).message); }
    finally { this.busy.set(false); }
  }
  private focusCreate(): void { if (!this.destroy.destroyed) afterNextRender(() => this.newButton()?.nativeElement.focus(), { injector: this.injector }); }
  closeEditor(): void { this.editor.set(null); this.focusCreate(); }
  async onSaved(): Promise<void> { this.editor.set(null); this.message.set('Ejercicio guardado en esta persona.'); await this.loadCustom(); this.focusCreate(); }
}
