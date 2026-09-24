import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ExercisePosePair } from './exercise-pose-pair';
import { categoryLabels, loggingLabels, type ExerciseChoice } from './exercise-catalog.model';

@Component({ selector: 'app-exercise-detail', imports: [ExercisePosePair], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><p>{{ categories[exercise().entry.category] }} · {{ logging[exercise().entry.loggingType] }}</p>
    <p>{{ exercise().entry.instruction || 'Sin instrucciones adicionales.' }}</p>
    @if (exercise(); as choice) {
      @if (choice.kind === 'catalog') {
        <p><strong>Músculos:</strong> {{ choice.entry.muscles.join(', ') }}<br /><strong>Equipamiento:</strong> {{ choice.entry.equipment.join(', ') }}</p>
        <app-exercise-pose-pair [name]="choice.name" [media]="choice.entry.media" />
        <a href="licenses/exercises-notice.txt" target="_blank" rel="noopener">Aviso de atribución y licencias del catálogo</a>
      } @else {
        <p>Datos aportados por esta persona. Sin verificación del catálogo ilustrado.</p>
        <p><strong>Equipamiento:</strong> {{ choice.entry.equipment?.join(', ') || 'Sin especificar' }}</p>
        <app-exercise-pose-pair [name]="choice.name" /><p><strong>Notas:</strong> {{ choice.entry.notes || 'Sin notas.' }}</p>
      }
    }</div>` })
export class ExerciseDetail {
  readonly exercise = input.required<ExerciseChoice>();
  protected readonly categories = categoryLabels;
  protected readonly logging = loggingLabels;
}
