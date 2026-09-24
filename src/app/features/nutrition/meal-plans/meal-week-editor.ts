import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from '../../../shared/ui/button';
import { NutrientValues } from '../foods/nutrient-values';
import type { FoodChoice } from '../foods/food.model';
import { RowActions } from '../../routines/row-actions';
import { MealDayEditor } from './meal-day-editor';
import { duplicateDay, editRows, newDay, previewTotal, type MealPlanDayDraft, type MealPlanWeekDraft, type RowAction } from './meal-planning';

@Component({ selector: 'app-meal-week-editor', imports: [Button, NutrientValues, RowActions, MealDayEditor], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><div class="field"><label [for]="week().id + '-name'">Nombre de la semana</label>
      <input [id]="week().id + '-name'" [value]="week().name" maxlength="160" (input)="rename($event)" /></div>
    @for (day of week().days; track day.id; let index = $index) {
      <details class="editor-card" data-testid="plan-day"><summary>Día {{ index + 1 }} · {{ day.name || 'Sin nombre' }}</summary>
        <div class="stack"><app-row-actions [label]="'día ' + (index + 1)" [first]="$first" [last]="$last" (action)="act(day, $event)" />
          <app-meal-day-editor [day]="day" [choices]="choices()" (changed)="replace($event)" /></div></details>
    }
    <button type="button" appButton variant="secondary" (click)="changed.emit({ ...week(), days: [...week().days, newDay('Día adicional')] })">Añadir día</button>
    <p><strong>Total previsto de la semana</strong></p><app-nutrient-values [values]="previewTotal([week()])" />
  </div>`, styleUrl: '../../routines/routine-editor.scss' })
export class MealWeekEditor {
  readonly week = input.required<MealPlanWeekDraft>(); readonly choices = input.required<FoodChoice[]>(); readonly changed = output<MealPlanWeekDraft>();
  protected readonly previewTotal = previewTotal;
  protected readonly newDay = newDay;
  protected rename(event: Event): void { this.changed.emit({ ...this.week(), name: (event.target as HTMLInputElement).value }); }
  protected replace(day: MealPlanDayDraft): void { this.changed.emit({ ...this.week(), days: this.week().days.map(item => item.id === day.id ? day : item) }); }
  protected act(day: MealPlanDayDraft, action: RowAction): void { this.changed.emit({ ...this.week(), days: editRows(this.week().days, day.id, action, duplicateDay) }); }
}
