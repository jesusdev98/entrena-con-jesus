import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkspaceStore } from '../../people/workspace.store';
import { PersonDiary } from './person-diary';

@Component({ selector: 'app-diary-page', imports: [RouterLink, PersonDiary], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack diary-page"><header><p class="eyebrow">Consumo real</p><h1>Diario alimentario</h1>
    <p>Registra lo que comiste en cada fecha. Las cantidades planificadas no cuentan hasta marcarlas como consumidas.</p>
    <p><a routerLink="/meal-plans">Planes de comidas</a> · <a routerLink="/nutrition">Explorar alimentos</a> · <a routerLink="/activity">Actividad y objetivos</a></p></header>
    @for (context of contexts(); track context.key) { <app-person-diary [personId]="context.personId" [name]="context.name" /> }
  </div>`, styles: ':host { display:block; min-width:0 } .diary-page { grid-template-columns:minmax(0,1fr) }' })
export class DiaryPage {
  private readonly workspace = inject(WorkspaceStore);
  protected readonly contexts = computed(() => { const person = this.workspace.activePerson(); return person ?
    [{ personId: person.id, name: person.displayName, key: `${person.id}:${this.workspace.settings()?.mode}` }] : []; });
}
