import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { WorkspaceStore } from '../people/workspace.store';
import { PersonTraining } from './person-training';

@Component({ selector: 'app-training-page', imports: [PersonTraining], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><header><p class="eyebrow">Registro real</p><h1>Entrenamiento</h1><p>Objetivos y resultados separados, guardados en esta persona.</p></header>
    @for (context of contexts(); track context.key) { <app-person-training [person]="context.person" [initialRevision]="revision" [initialSession]="session" /> }
  </div>` })
export class TrainingPage {
  private readonly workspace = inject(WorkspaceStore); private readonly route = inject(ActivatedRoute);
  readonly revision = this.route.snapshot.queryParamMap.get('revision') ?? ''; readonly session = this.route.snapshot.queryParamMap.get('session') ?? '';
  readonly contexts = computed(() => { const person = this.workspace.activePerson(); return person ? [{ person, key: `${person.id}:${this.workspace.settings()?.mode}` }] : []; });
}
