import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkspaceStore } from '../people/workspace.store';
import { PersonExerciseCatalog } from './person-exercise-catalog';

@Component({ selector: 'app-exercise-catalog-page', imports: [RouterLink, PersonExerciseCatalog], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><header><p class="eyebrow">Catálogo local</p><h1>Ejercicios</h1>
    <p>Busca ejercicios por nombre o alias y consulta sus instrucciones, equipamiento y dos posiciones ilustradas.</p>
    <p>Guarda ejercicios personalizados para la persona activa, sin ilustraciones.</p>
    <p><a routerLink="/routines">Planificar una rutina</a>. El registro de sesiones todavía no está disponible.</p>
    <a routerLink="/settings">Preparación sin conexión y ajustes</a></header>
    @for (context of contexts(); track context.key) { <app-person-exercise-catalog [person]="context.person" /> }
  </div>` })
export class ExerciseCatalogPage {
  private readonly workspace = inject(WorkspaceStore);
  // Recreate person-bound editors on identity or mode transitions, never on display name.
  protected readonly contexts = computed(() => { const person = this.workspace.activePerson(); return person ? [{ person, key: `${person.id}:${this.workspace.settings()?.mode}` }] : []; });
}
