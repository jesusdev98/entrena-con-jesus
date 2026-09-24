import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Button } from '../../shared/ui/button';
import { ExercisePicker } from '../exercises/exercise-picker';
import { ExerciseDetail } from '../exercises/exercise-detail';
import type { ExerciseChoice } from '../exercises/exercise-catalog.model';

@Component({ selector: 'app-routine-picker-dialog', imports: [Button, ExercisePicker, ExerciseDetail], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><button appButton variant="secondary" (click)="ref.close()">Cerrar selector</button>
    <h2 id="routine-picker-title">Añadir ejercicio al día</h2>
    @if (selected(); as exercise) {
      <h3>{{ exercise.name }}</h3><app-exercise-detail [exercise]="exercise" />
      <button appButton (click)="ref.close(exercise)">Añadir al día</button>
      <button appButton variant="secondary" (click)="selected.set(null)">Volver a la búsqueda</button>
    } @else { <app-exercise-picker [exercises]="choices" (selected)="selected.set($event)" /> }
  </div>`, styles: `:host { display: block; width: min(48rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); overflow-y: auto; padding: 1rem; background: var(--surface); border-radius: var(--radius); }` })
export class RoutinePickerDialog {
  protected readonly choices = inject<ExerciseChoice[]>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<ExerciseChoice>>(DialogRef);
  protected readonly selected = signal<ExerciseChoice | null>(null);
}
