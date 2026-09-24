import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WorkspaceStore } from '../people/workspace.store';
import { PersonProgress } from './person-progress';

@Component({ selector: 'app-progress-page', imports: [PersonProgress], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><header><p class="eyebrow">Resultados reales</p><h1>Progreso</h1><p>Historial semanal y comparación de entrenamientos.</p></header>
    @for (context of contexts(); track context.key) { <app-person-progress [person]="context.person" /> }
  </div>` })
export class ProgressPage {
  private readonly workspace = inject(WorkspaceStore);
  readonly contexts = computed(() => { const person = this.workspace.activePerson(); return person ? [{ person, key: `${person.id}:${this.workspace.settings()?.mode}` }] : []; });
}
