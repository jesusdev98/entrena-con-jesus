import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Button } from '../../../shared/ui/button';
import { NutrientValues } from '../foods/nutrient-values';
import { filterFoods, scaleFood, type FoodChoice } from '../foods/food.model';
import type { PlannedFood } from '../nutrition.model';
import { duplicateFood, editRows, newPlannedFood, totalFoods, type PlannedMealDraft, type PlannedFoodDraft, type RowAction } from './meal-planning';
import { RowActions } from '../../routines/row-actions';

@Component({ selector: 'app-meal-group-editor', imports: [Button, NutrientValues, RowActions], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="stack" data-testid="meal-group"><div class="field"><label [for]="meal().id + '-name'">Nombre de la comida</label>
      <input [id]="meal().id + '-name'" [value]="meal().name" maxlength="160" (input)="rename($event)" /></div>
    @for (item of meal().foods; track item.id; let index = $index) {
      <div class="meal-food stack" data-testid="planned-food"><strong>{{ item.food.name }}</strong>
        <p class="muted">{{ 'fdcId' in item.food.source ? 'USDA · FDC ' + item.food.source.fdcId : 'Personalizado' }} · valores capturados por 100 g</p>
        <div class="field"><label [for]="item.id + '-grams'">Gramos de {{ item.food.name }}</label>
          <input [id]="item.id + '-grams'" type="number" inputmode="decimal" min="0.01" step="any" [value]="item.grams ?? ''" (input)="grams(item, $event)" /></div>
        @if (item.grams !== null && item.grams > 0 && finite(item.grams)) { <app-nutrient-values [values]="scaled(item)" /> }
        <app-row-actions [label]="'alimento ' + (index + 1)" [first]="$first" [last]="$last" (action)="act(item, $event)" />
      </div>
    }
    <div class="field"><label [for]="meal().id + '-search'">Buscar alimento para {{ meal().name }}</label>
      <input [id]="meal().id + '-search'" type="search" [value]="search()" (input)="search.set(text($event))" /></div>
    <div class="field"><label [for]="meal().id + '-food'">Elegir alimento (preparación y origen)</label>
      <select [id]="meal().id + '-food'" [value]="selected()" (change)="selected.set(text($event))">
        <option value="">Selecciona un alimento</option>
        @for (choice of matching(); track choice.kind + choice.id) {
          <option [value]="choice.kind + ':' + choice.id">{{ choice.name }} · {{ choice.kind === 'usda' ? choice.entry.preparation + ' · USDA' : 'Personalizado' }}</option>
        }
      </select></div>
    <button type="button" appButton variant="secondary" [disabled]="!selected()" (click)="addFood()">Añadir alimento (indica los gramos)</button>
    @if (!matching().length) { <p>No hay alimentos coincidentes; prueba otra búsqueda o crea uno personalizado en el catálogo.</p> }
    <p><strong>Total previsto de la comida</strong></p><app-nutrient-values [values]="totals()" />
  </section>`, styles: `:host { display: block; min-width: 0; } .meal-food { padding: .6rem; background: var(--blue-soft); border-radius: .7rem; min-width: 0; } strong { overflow-wrap: anywhere; } select, input { max-width: 100%; }` })
export class MealGroupEditor {
  readonly meal = input.required<PlannedMealDraft>();
  readonly choices = input.required<FoodChoice[]>();
  readonly changed = output<PlannedMealDraft>();
  readonly search = signal(''); readonly selected = signal('');
  readonly matching = computed(() => filterFoods(this.choices(), { query: this.search(), group: '', preparation: '' }).slice(0, 80));
  readonly totals = computed(() => totalFoods(this.meal().foods.filter((item): item is PlannedFood => item.grams !== null && item.grams > 0 && Number.isFinite(item.grams))));
  protected readonly finite = Number.isFinite;
  protected text(event: Event): string { return (event.target as HTMLInputElement).value; }
  protected rename(event: Event): void { this.changed.emit({ ...this.meal(), name: this.text(event) }); }
  protected grams(item: PlannedFoodDraft, event: Event): void {
    const text = this.text(event);
    this.changed.emit({ ...this.meal(), foods: this.meal().foods.map(row => row.id === item.id ? { ...row, grams: text === '' ? null : Number(text) } : row) });
  }
  protected scaled(item: PlannedFoodDraft) { return scaleFood(item.food.per100g, item.grams!); }
  protected addFood(): void {
    const choice = this.choices().find(item => `${item.kind}:${item.id}` === this.selected());
    if (!choice) return;
    this.changed.emit({ ...this.meal(), foods: [...this.meal().foods, newPlannedFood(choice)] });
    this.selected.set('');
  }
  protected act(item: PlannedFoodDraft, action: RowAction): void {
    this.changed.emit({ ...this.meal(), foods: editRows(this.meal().foods, item.id, action, duplicateFood) });
  }
}
