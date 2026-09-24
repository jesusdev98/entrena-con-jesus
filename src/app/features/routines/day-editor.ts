import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Button } from '../../shared/ui/button';
import type { UUID } from '../../core/domain/identity';
import type { RoutineDayDraft, RoutineExerciseDraft } from './routine.model';
import { duplicateExercise, editRows, type RowAction } from './routine-planning';
import { RowActions } from './row-actions';
import { RoutineExerciseEditor } from './routine-exercise-editor';

@Component({ selector: 'app-day-editor', imports: [ReactiveFormsModule, Button, RowActions, RoutineExerciseEditor], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><div class="field"><label [for]="value().id + '-name'">Nombre del día</label><input [id]="value().id + '-name'" [formControl]="name" maxlength="160" /></div>
    @for (exercise of value().exercises; track exercise.id; let index = $index) {
      <details open class="editor-card" data-testid="routine-exercise"><summary>{{ index + 1 }}. {{ exercise.exercise.name }}</summary><div class="stack">
        <app-row-actions [label]="'ejercicio ' + (index + 1)" [first]="$first" [last]="$last" (action)="act(exercise, $event)" />
        <app-routine-exercise-editor [value]="exercise" (changed)="replaceExercise($event)" /></div></details>
    }
    @if (!value().exercises.length) { <p class="muted">Día incompleto: añade un ejercicio.</p> }
    <button type="button" appButton variant="secondary" (click)="pick.emit(value().id)">Añadir ejercicio</button></div>`, styleUrl: './routine-editor.scss' })
export class DayEditor {
  readonly value = input.required<RoutineDayDraft>(); readonly changed = output<RoutineDayDraft>(); readonly pick = output<UUID>();
  readonly name = new FormControl('', { nonNullable: true });
  constructor() { effect(() => this.name.setValue(this.value().name, { emitEvent: false })); this.name.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(name => this.changed.emit({ ...this.value(), name })); }
  replaceExercise(exercise: RoutineExerciseDraft): void { this.changed.emit({ ...this.value(), exercises: this.value().exercises.map(item => item.id === exercise.id ? exercise : item) }); }
  act(exercise: RoutineExerciseDraft, action: RowAction): void { this.changed.emit({ ...this.value(), exercises: editRows(this.value().exercises, exercise.id, action, duplicateExercise) }); }
}
