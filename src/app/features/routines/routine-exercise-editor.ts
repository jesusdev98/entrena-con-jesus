import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Button } from '../../shared/ui/button';
import { ExercisePosePair } from '../exercises/exercise-pose-pair';
import { loggingLabels } from '../exercises/exercise-catalog.model';
import type { PlannedSetDraft, RoutineExerciseDraft } from './routine.model';
import { duplicateSet, editRows, newSet, type RowAction } from './routine-planning';
import { RowActions } from './row-actions';
import { SetEditor } from './set-editor';

@Component({ selector: 'app-routine-exercise-editor', imports: [ReactiveFormsModule, Button, ExercisePosePair, RowActions, SetEditor], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><p class="badge">{{ logging[value().exercise.loggingType] }}</p>
    <details><summary>Instrucciones e ilustraciones guardadas</summary><p>{{ value().exercise.instruction || 'Sin instrucciones adicionales.' }}</p>
      @if (reviewedMedia(); as media) { <app-exercise-pose-pair [name]="value().exercise.name" [media]="media" /> }
      @else { <p class="notice">No hay ilustraciones asociadas.</p> }
    </details>
    <div class="field"><label [for]="value().id + '-notes'">Notas del ejercicio</label><textarea [id]="value().id + '-notes'" [formControl]="notes" maxlength="1000"></textarea></div>
    @for (set of value().sets; track set.id; let index = $index) {
      <section class="set-card stack" data-testid="planned-set"><app-set-editor [value]="set" [position]="index + 1" (changed)="replaceSet($event)" />
        <app-row-actions [label]="'serie ' + (index + 1)" [first]="$first" [last]="$last" (action)="act(set, $event)" /></section>
    }
    <button type="button" appButton variant="secondary" (click)="addSet()">Añadir serie</button></div>`,
  styleUrl: './routine-editor.scss' })
export class RoutineExerciseEditor {
  readonly value = input.required<RoutineExerciseDraft>(); readonly changed = output<RoutineExerciseDraft>();
  readonly notes = new FormControl('', { nonNullable: true }); protected readonly logging = loggingLabels;
  constructor() { effect(() => this.notes.setValue(this.value().notes, { emitEvent: false })); this.notes.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(notes => this.changed.emit({ ...this.value(), notes })); }
  reviewedMedia() { const media = this.value().exercise.media; return media && 'frames' in media ? media : null; }
  replaceSet(set: PlannedSetDraft): void { this.changed.emit({ ...this.value(), sets: this.value().sets.map(item => item.id === set.id ? set : item) }); }
  act(set: PlannedSetDraft, action: RowAction): void { this.changed.emit({ ...this.value(), sets: editRows(this.value().sets, set.id, action, duplicateSet) }); }
  addSet(): void { this.changed.emit({ ...this.value(), sets: [...this.value().sets, newSet(this.value().exercise.loggingType)] }); }
}
