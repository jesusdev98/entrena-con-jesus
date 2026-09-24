import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { JsonPipe } from '@angular/common';
import type { PlannedSetDraft, RoutineContentDraft } from './routine.model';

/** Full detached values remain inspectable, including prescriptions and frame credits. */
@Component({ selector: 'app-routine-comparison', imports: [JsonPipe], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section><h3>{{ label() }} · {{ name() || 'Sin nombre' }}</h3>
    <p>Notas: {{ content().notes || 'Sin notas' }}</p>
    @for (week of content().weeks; track week.id) { <h4>{{ week.name }} · {{ week.days.length }} días</h4>
      @for (day of week.days; track day.id) { <p><strong>{{ day.name }}</strong></p>
        @for (exercise of day.exercises; track exercise.id) { <p>{{ exercise.exercise.name }} · {{ exercise.notes || 'Sin notas' }}</p>
          <ol>@for (set of exercise.sets; track set.id) { <li>{{ target(set) }} · Descanso: {{ set.restSeconds ?? 'Sin indicar' }} s · {{ set.notes || 'Sin notas' }}</li> }</ol>
        }
      }
    }
    <details><summary>Todos los valores y créditos</summary><pre>{{ content() | json }}</pre></details>
  </section>`, styles: `:host { display: block; min-width: 0; } pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .8rem; }` })
export class RoutineComparison {
  readonly label = input.required<string>(); readonly name = input.required<string>(); readonly content = input.required<RoutineContentDraft>();
  target(set: PlannedSetDraft): string {
    const number = (value: number | null) => value === null ? 'Sin indicar' : value.toLocaleString('es');
    if ('reps' in set) {
      const load = set.type === 'weight-reps' ? `Peso externo: ${number(set.weightKg)} kg` : set.type === 'assisted-reps' ? `Asistencia: ${number(set.assistanceKg)} kg` : 'Peso corporal';
      return `${number(set.reps.minimum)}–${number(set.reps.maximum)} repeticiones · ${load} · RIR objetivo: ${number(set.targetRir)}`;
    }
    return `${set.type === 'distance-duration' ? `Distancia: ${number(set.meters)} m · ` : ''}Duración: ${number(set.seconds)} s`;
  }
}
