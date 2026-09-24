import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkspaceStore } from '../../people/workspace.store';
import { PersonMealPlans } from './person-meal-plans';

@Component({ selector: 'app-meal-plans-page', imports: [RouterLink, PersonMealPlans], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><header><p class="eyebrow">Planificación local</p><h1>Planes de comidas</h1>
    <p>Organiza semanas, días, comidas y cantidades previstas para la persona activa.</p>
    <p class="muted">Los planes no registran consumo real hasta que marques una comida en el diario.</p>
    <a routerLink="/nutrition">Explorar alimentos</a> · <a routerLink="/diary">Abrir diario alimentario</a></header>
    @for (context of contexts(); track context.key) { <app-person-meal-plans [person]="context.person" /> }
  </div>` })
export class MealPlansPage {
  private readonly workspace = inject(WorkspaceStore);
  protected readonly contexts = computed(() => { const person = this.workspace.activePerson(); return person ? [{ person, key: `${person.id}:${this.workspace.settings()?.mode}` }] : []; });
}
