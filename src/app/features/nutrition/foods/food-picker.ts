import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { NutrientValues } from './nutrient-values';
import { filterFoods, preparationLabels, type FoodChoice } from './food.model';

@Component({ selector: 'app-food-picker', imports: [ReactiveFormsModule, Button, Card, NutrientValues],
  changeDetection: ChangeDetectionStrategy.OnPush, template: `
    <div class="stack">
      <form class="stack" [formGroup]="form" (submit)="$event.preventDefault()" role="search" aria-label="Buscar alimentos">
        <div class="field"><label for="food-search">Buscar alimento</label>
          <input id="food-search" type="search" formControlName="query" placeholder="Nombre en español o descripción original" /></div>
        <div class="grid"><div class="field"><label for="food-group">Grupo</label>
          <select id="food-group" formControlName="group"><option value="">Todos los grupos</option>
            @for (group of groups(); track group) { <option [value]="group">{{ group }}</option> }</select></div>
          <div class="field"><label for="food-preparation">Preparación</label>
            <select id="food-preparation" formControlName="preparation"><option value="">Todas las preparaciones</option>
              @for (preparation of preparations; track preparation.key) { <option [value]="preparation.key">{{ preparation.label }}</option> }</select></div></div>
      </form>
      <p role="status" aria-live="polite">{{ filtered().length }} alimentos encontrados.</p>
      @if (filtered().length === 0) {
        <div class="notice"><h2>No hay alimentos que coincidan</h2><p>Prueba otro nombre, cambia el origen o elimina los filtros.</p>
          <button appButton variant="secondary" (click)="form.reset()">Limpiar búsqueda y filtros</button></div>
      }
      <div class="grid">@for (food of filtered(); track food.kind + food.id) {
        <app-card><article class="stack" data-testid="food-card">
          <div><span class="badge">{{ food.kind === 'usda' ? preparationLabels[food.entry.preparation] : food.entry.archived ? 'Personalizado · Archivado' : 'Personalizado' }}</span>
            <h2>{{ food.name }}</h2><p class="muted">{{ food.kind === 'usda' ? food.entry.group + ' · USDA' : 'Datos aportados por la persona' }}</p></div>
          <div><p class="basis">Por 100 g de alimento</p><app-nutrient-values [values]="food.per100g" /></div>
          <button appButton variant="secondary" (click)="selected.emit(food)" [attr.aria-label]="'Ver detalles de ' + food.name">Ver detalles</button>
        </article></app-card>
      }</div>
    </div>`, styles: `:host { display: block; min-width: 0; } h2 { margin: .75rem 0 .4rem; overflow-wrap: anywhere; }
      p { margin-bottom: 0; } .basis { margin-bottom: .75rem; font-size: .85rem; } select { max-width: 100%; }` })
export class FoodPicker {
  readonly foods = input.required<FoodChoice[]>();
  readonly selected = output<FoodChoice>();
  readonly form = new FormGroup({ query: new FormControl('', { nonNullable: true }), group: new FormControl('', { nonNullable: true }), preparation: new FormControl('', { nonNullable: true }) });
  private readonly filters = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly preparationLabels = preparationLabels;
  protected readonly preparations = Object.entries(preparationLabels).map(([key, label]) => ({ key, label }));
  protected readonly groups = computed(() => [...new Set(this.foods().map(food => food.kind === 'usda' ? food.entry.group : 'Personalizados'))].sort((a, b) => a.localeCompare(b, 'es')));
  readonly filtered = computed(() => { const filters = this.filters(); return filterFoods(this.foods(), { query: filters.query ?? '', group: filters.group ?? '', preparation: filters.preparation ?? '' }); });
}
