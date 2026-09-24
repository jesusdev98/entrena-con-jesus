import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { UUID } from '../../core/domain/identity';
import { PersonEditor } from './person-editor';
import { WorkspaceStore } from './workspace.store';

@Component({ selector: 'app-person-page', imports: [PersonEditor, RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><a [routerLink]="workspace.isTrainer() ? '/people' : '/'">← Volver al espacio</a>
    <header><p class="eyebrow">Perfil local</p><h1>{{ id() ? 'Un perfil, una persona.' : 'Conoce a tu próximo cliente.' }}</h1>
      <p class="muted">Empieza con su nombre. Los demás datos pueden esperar.</p></header>
    @for (key of [id()]; track key) { <app-person-editor [personId]="key" (saved)="finish($event)" /> }
  </div>` })
export class PersonPage {
  readonly id = input<UUID>();
  protected readonly workspace = inject(WorkspaceStore);
  private readonly router = inject(Router);
  protected async finish(id: UUID): Promise<void> {
    if (await this.workspace.selectPerson(id)) await this.router.navigateByUrl('/');
  }
}
