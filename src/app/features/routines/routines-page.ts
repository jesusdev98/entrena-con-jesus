import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkspaceStore } from '../people/workspace.store';
import { PersonRoutines } from './person-routines';

@Component({ selector: 'app-routines-page', imports: [RouterLink, PersonRoutines], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><header><p class="eyebrow">Planificación local</p><h1>Rutinas</h1>
    <p>Organiza semanas, días y objetivos por serie. Registra lo realizado desde una revisión guardada.</p>
    <a routerLink="/training">Registrar entrenamiento / continuar borrador</a>
    <a routerLink="/exercises">Explorar ejercicios</a></header>
    @for (context of contexts(); track context.key) { <app-person-routines [person]="context.person" /> }
  </div>` })
export class RoutinesPage {
  private readonly workspace = inject(WorkspaceStore);
  protected readonly contexts = computed(() => { const person = this.workspace.activePerson(); return person ? [{ person, key: `${person.id}:${this.workspace.settings()?.mode}` }] : []; });
}
