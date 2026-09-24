import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Button } from '../../shared/ui/button';
import type { UUID } from '../../core/domain/identity';
import type { RoutineDayDraft, RoutineWeekDraft } from './routine.model';
import { duplicateDay, editRows, newDay, type RowAction } from './routine-planning';
import { RowActions } from './row-actions';
import { DayEditor } from './day-editor';

@Component({ selector: 'app-week-editor', imports: [ReactiveFormsModule, Button, RowActions, DayEditor], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><div class="field"><label [for]="value().id + '-name'">Nombre de la semana</label><input [id]="value().id + '-name'" [formControl]="name" maxlength="160" /></div>
    @for (day of value().days; track day.id; let index = $index) {
      <details open class="editor-card" data-testid="routine-day"><summary>Día {{ index + 1 }} · {{ day.name || 'Sin nombre' }}</summary><div class="stack">
        <app-row-actions [label]="'día ' + (index + 1)" [first]="$first" [last]="$last" (action)="act(day, $event)" />
        <app-day-editor [value]="day" (changed)="replaceDay($event)" (pick)="pick.emit($event)" /></div></details>
    }
    <button type="button" appButton variant="secondary" (click)="addDay()">Añadir día</button></div>`, styleUrl: './routine-editor.scss' })
export class WeekEditor {
  readonly value = input.required<RoutineWeekDraft>(); readonly changed = output<RoutineWeekDraft>(); readonly pick = output<UUID>();
  readonly name = new FormControl('', { nonNullable: true });
  constructor() { effect(() => this.name.setValue(this.value().name, { emitEvent: false })); this.name.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(name => this.changed.emit({ ...this.value(), name })); }
  replaceDay(day: RoutineDayDraft): void { this.changed.emit({ ...this.value(), days: this.value().days.map(item => item.id === day.id ? day : item) }); }
  act(day: RoutineDayDraft, action: RowAction): void { this.changed.emit({ ...this.value(), days: editRows(this.value().days, day.id, action, duplicateDay) }); }
  addDay(): void { this.changed.emit({ ...this.value(), days: [...this.value().days, newDay()] }); }
}
