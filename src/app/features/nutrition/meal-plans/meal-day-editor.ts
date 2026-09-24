import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from '../../../shared/ui/button';
import { NutrientValues } from '../foods/nutrient-values';
import type { FoodChoice } from '../foods/food.model';
import { RowActions } from '../../routines/row-actions';
import { MealGroupEditor } from './meal-group-editor';
import { duplicateMeal, editRows, newMeal, previewTotal, type MealPlanDayDraft, type PlannedMealDraft, type RowAction } from './meal-planning';

@Component({ selector: 'app-meal-day-editor', imports: [Button, NutrientValues, RowActions, MealGroupEditor], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><div class="field"><label [for]="day().id + '-name'">Nombre del día</label>
      <input [id]="day().id + '-name'" [value]="day().name" maxlength="160" (input)="rename($event)" /></div>
    @for (meal of day().meals; track meal.id; let index = $index) {
      <details class="editor-card" open data-testid="plan-meal"><summary>Comida {{ index + 1 }} · {{ meal.name || 'Sin nombre' }}</summary>
        <div class="stack"><app-row-actions [label]="'comida ' + (index + 1)" [first]="$first" [last]="$last" (action)="act(meal, $event)" />
          <app-meal-group-editor [meal]="meal" [choices]="choices()" (changed)="replace($event)" /></div></details>
    }
    <button type="button" appButton variant="secondary" (click)="changed.emit({ ...day(), meals: [...day().meals, newMeal()] })">Añadir comida</button>
    <p><strong>Total previsto del día</strong></p><app-nutrient-values [values]="previewTotal([{ id: day().id, name: '', days: [day()] }])" />
  </div>`, styleUrl: '../../routines/routine-editor.scss' })
export class MealDayEditor {
  readonly day = input.required<MealPlanDayDraft>(); readonly choices = input.required<FoodChoice[]>(); readonly changed = output<MealPlanDayDraft>();
  protected readonly previewTotal = previewTotal;
  protected readonly newMeal = newMeal;
  protected rename(event: Event): void { this.changed.emit({ ...this.day(), name: (event.target as HTMLInputElement).value }); }
  protected replace(meal: PlannedMealDraft): void { this.changed.emit({ ...this.day(), meals: this.day().meals.map(item => item.id === meal.id ? meal : item) }); }
  protected act(meal: PlannedMealDraft, action: RowAction): void { this.changed.emit({ ...this.day(), meals: editRows(this.day().meals, meal.id, action, duplicateMeal) }); }
}
