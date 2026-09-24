import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { categoryLabels, loggingLabels, filterExercises, type ExerciseChoice } from './exercise-catalog.model';

@Component({ selector: 'app-exercise-picker', imports: [ReactiveFormsModule, Button, Card], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><form class="stack" [formGroup]="form" (submit)="$event.preventDefault()" role="search" aria-label="Buscar ejercicios">
    <div class="field"><label for="exercise-search">Buscar ejercicio</label><input id="exercise-search" type="search" formControlName="query" placeholder="Nombre o alias en español" /></div>
    <div class="grid"><div class="field"><label for="exercise-category">Categoría</label><select id="exercise-category" formControlName="category"><option value="">Todas las categorías</option>
      @for (category of categories; track category.key) { <option [value]="category.key">{{ category.label }}</option> }</select></div>
      <div class="field"><label for="exercise-muscle">Músculo</label><select id="exercise-muscle" formControlName="muscle"><option value="">Todos los músculos</option>
        @for (muscle of muscles(); track muscle) { <option [value]="muscle">{{ muscle }}</option> }</select></div>
      <div class="field"><label for="exercise-equipment">Equipamiento</label><select id="exercise-equipment" formControlName="equipment"><option value="">Todo el equipamiento</option>
        @for (item of equipment(); track item) { <option [value]="item">{{ item }}</option> }</select></div></div></form>
    <p role="status" aria-live="polite">{{ filtered().length }} ejercicios encontrados.</p>
    @if (filtered().length === 0) { <div class="notice"><h2>No hay ejercicios que coincidan</h2><p>Prueba otro nombre o elimina los filtros.</p>
      <button appButton variant="secondary" (click)="form.reset()">Limpiar búsqueda y filtros</button></div> }
    <div class="grid">@for (exercise of filtered(); track exercise.kind + exercise.id) {
      <app-card><article class="stack" data-testid="exercise-card"><div><span class="badge">{{ labels[exercise.entry.category] }}{{ exercise.kind === 'custom' ? ' · Personalizado' + (exercise.entry.archived ? ' · Archivado' : '') : ' · Catálogo ilustrado' }}</span>
        <h2>{{ exercise.name }}</h2><p>{{ logging[exercise.entry.loggingType] }}</p></div>
        <p>{{ exercise.entry.instruction || 'Sin instrucciones adicionales.' }}</p>
        @if (exercise.kind === 'catalog') { <p class="muted">Músculos: {{ exercise.entry.muscles.join(', ') }}<br />Equipamiento: {{ exercise.entry.equipment.join(', ') }}</p> }
        <button appButton variant="secondary" (click)="selected.emit(exercise)" [attr.aria-label]="'Ver detalles de ' + exercise.name">Ver detalles</button>
      </article></app-card>
    }</div></div>`, styles: `:host { display: block; min-width: 0; } h2 { margin: .75rem 0; overflow-wrap: anywhere; } select { max-width: 100%; }` })
export class ExercisePicker {
  readonly exercises = input.required<ExerciseChoice[]>();
  readonly includeArchived = input(false);
  readonly selected = output<ExerciseChoice>();
  readonly form = new FormGroup({ query: new FormControl('', { nonNullable: true }), category: new FormControl('', { nonNullable: true }), muscle: new FormControl('', { nonNullable: true }), equipment: new FormControl('', { nonNullable: true }) });
  private readonly filters = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly labels = categoryLabels;
  protected readonly logging = loggingLabels;
  protected readonly categories = Object.entries(categoryLabels).map(([key, label]) => ({ key, label }));
  private options(field: 'muscles' | 'equipment'): string[] { return [...new Set(this.available().flatMap(exercise => field === 'equipment' ? exercise.entry.equipment ?? [] : exercise.kind === 'catalog' ? exercise.entry.muscles : []))].sort((a, b) => a.localeCompare(b, 'es')); }
  private readonly available = computed(() => this.exercises().filter(exercise => exercise.kind === 'catalog' || !exercise.entry.archived || this.includeArchived()));
  protected readonly muscles = computed(() => this.options('muscles'));
  protected readonly equipment = computed(() => this.options('equipment'));
  readonly filtered = computed(() => { const filters = this.filters(); return filterExercises(this.available(), { query: filters.query ?? '', category: filters.category ?? '', muscle: filters.muscle ?? '', equipment: filters.equipment ?? '' }); });
}
