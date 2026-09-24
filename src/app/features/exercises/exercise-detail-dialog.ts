import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Button } from '../../shared/ui/button';
import { ExerciseDetail } from './exercise-detail';
import type { ExerciseChoice } from './exercise-catalog.model';

export type ExerciseDetailAction = 'edit' | 'archive' | 'restore';

@Component({ selector: 'app-exercise-detail-dialog', imports: [Button, ExerciseDetail], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><button appButton variant="secondary" (click)="ref.close()">Cerrar detalles</button>
    <h2 id="exercise-detail-title">{{ exercise.name }}</h2><app-exercise-detail [exercise]="exercise" />
    @if (exercise.kind === 'custom') {
      <div class="actions">@if (exercise.entry.archived) {
        <button appButton (click)="ref.close('restore')">Restaurar ejercicio</button>
      } @else {
        <button appButton (click)="ref.close('edit')">Editar ejercicio</button>
        <button appButton variant="secondary" (click)="ref.close('archive')">Archivar ejercicio</button>
      }</div>
    }
    </div>`,
  styles: `:host { display: block; width: min(44rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); overflow-y: auto; padding: 1.25rem;
    border-radius: var(--radius); background: var(--surface); box-shadow: 0 20px 80px #11182733; } h2 { overflow-wrap: anywhere; }` })
export class ExerciseDetailDialog {
  protected readonly exercise = inject<ExerciseChoice>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<ExerciseDetailAction>>(DialogRef);
}
