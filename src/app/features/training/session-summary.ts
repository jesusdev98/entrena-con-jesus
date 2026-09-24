import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { actualText, targetText } from './training-domain';
import type { TrainingSession } from './training.model';

@Component({ selector: 'app-session-summary', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<article class="stack" data-testid="session-summary"><h3>{{ value().date }} · {{ value().labels.routine }}</h3>
    <p>{{ value().labels.week }} · {{ value().labels.day }} · {{ value().status === 'completed' ? 'Guardada y finalizada' : 'Borrador' }}</p>
    <p>Duración de sesión: {{ value().durationMinutes ?? 'Sin indicar' }} min · {{ value().notes || 'Sin notas' }}</p>
    @for (exercise of value().exercises; track exercise.id) { @if (!exerciseId() || exercise.exercise.exerciseId === exerciseId()) {
      <section><h4>{{ exercise.exercise.name }}</h4><p>{{ exercise.notes }}</p>
        <table><caption>Objetivos y resultados · {{ exercise.exercise.name }}</caption><thead><tr><th scope="col">Serie</th><th scope="col">Objetivo</th><th scope="col">Realizado</th></tr></thead>
          <tbody>@for (set of exercise.sets; track set.id) { <tr><th scope="row">{{ $index + 1 }}</th><td>{{ target(set.prescribed) }}</td><td>{{ actual(set) }}</td></tr> }</tbody>
        </table>
      </section>
    } }
    <details><summary>Referencia estable y tiempos</summary><p class="identity">Sesión: {{ value().id }} · Versión: {{ value().version }}</p>
      <p class="identity">Revisión de rutina: {{ value().source?.revisionId }}</p><p>Inicio del registro: {{ value().startedAt }} · Finalización: {{ value().completedAt ?? 'Pendiente' }}</p>
      <p>La duración se indica manualmente; no es una estimación de calorías.</p></details>
  </article>`, styles: `:host { display: block; min-width: 0; } table { width: 100%; border-collapse: collapse; table-layout: fixed; } caption { text-align: left; margin-bottom: .5rem; } th, td { text-align: left; vertical-align: top; overflow-wrap: anywhere; padding: .5rem .25rem; border-bottom: 1px solid var(--line); } th:first-child { width: 3.5rem; }` })
export class SessionSummary {
  readonly value = input.required<TrainingSession>(); readonly exerciseId = input(''); readonly target = targetText; readonly actual = actualText;
}
