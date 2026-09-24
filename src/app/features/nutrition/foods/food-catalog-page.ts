import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkspaceStore } from '../../people/workspace.store';
import { PersonFoodCatalog } from './person-food-catalog';

@Component({ selector: 'app-food-catalog-page', imports: [RouterLink, PersonFoodCatalog], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><header><p class="eyebrow">Catálogo local</p><h1>Alimentación</h1>
    <p>Explora alimentos, consulta sus valores y guarda tus propios alimentos por persona.</p>
    <p><a routerLink="/activity">Actividad diaria y objetivos</a></p>
    <p><a routerLink="/meal-plans">Planificar comidas semanales</a></p>
    <p><a routerLink="/diary">Diario alimentario: registrar consumo real</a></p>
    <p class="muted">Las cantidades del catálogo son solo vistas previas. Solo los registros del diario cuentan como consumo.</p>
    <a routerLink="/settings">Preparación sin conexión y ajustes</a></header>
    @for (context of contexts(); track context.key) { <app-person-food-catalog [person]="context.person" /> }
  </div>` })
export class FoodCatalogPage {
  private readonly workspace = inject(WorkspaceStore);
  // Key by stable identity and mode, never by a display name or mutable selection object.
  protected readonly contexts = computed(() => { const person = this.workspace.activePerson(); return person ? [{ person, key: `${person.id}:${this.workspace.settings()?.mode}` }] : []; });
}
