import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { Card } from '../../shared/ui/card';
import { Button } from '../../shared/ui/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { WorkspaceStore } from './workspace.store';
import type { Person } from './person.model';

@Component({ selector: 'app-people-page', imports: [Card, Button, RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><header><p class="eyebrow">Acompañamiento personal</p><h1>Tus personas, su espacio.</h1>
    <p class="muted">Cada perfil tiene su propia identidad e historial. Selecciona a quién quieres acompañar.</p>
    <a appButton routerLink="/people/new">Añadir cliente</a></header>
    @if (workspace.people().length === 1) { <p class="notice">Todavía no hay clientes. Añade el primero; tu espacio personal ya está disponible.</p> }
    <div class="grid">@for (person of workspace.people(); track person.id) {
      <app-card><div class="stack"><div><span class="badge">{{ person.archived ? 'Archivado' : person.kind === 'personal' ? 'Mi espacio personal' : 'Cliente' }}</span>
        <h2>{{ person.displayName }}</h2><p class="muted">{{ person.reference || 'Sin referencia adicional' }}</p>
        <p class="identity">ID: {{ person.id }}</p></div>
        @if (!person.archived) {
          <div class="actions"><button appButton [disabled]="workspace.busy()" (click)="select(person)">{{ workspace.activePerson()?.id === person.id ? 'Abrir espacio activo' : 'Seleccionar' }}</button>
            <a appButton variant="secondary" [routerLink]="['/people', person.id]">Editar perfil</a></div>
          @if (person.kind === 'client') { <button class="text-button" [disabled]="workspace.busy()" (click)="archive(person)">Archivar cliente</button> }
        } @else { <button appButton variant="secondary" [disabled]="workspace.busy()" (click)="workspace.archive(person.id, false)">Restaurar cliente</button> }
      </div></app-card>
    }</div></div>`, styles: `h2 { margin: .8rem 0 .4rem; overflow-wrap: anywhere; } .text-button { background: none; border: 0; color: var(--muted); text-decoration: underline; text-underline-offset: .2rem; justify-self: start; min-height: 44px; }` })
export class PeoplePage {
  protected readonly workspace = inject(WorkspaceStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  protected async select(person: Person): Promise<void> { if (await this.workspace.selectPerson(person.id)) await this.router.navigateByUrl('/'); }
  protected async archive(person: Person): Promise<void> {
    const ref = this.dialog.open<boolean>(ConfirmDialog, { ariaLabelledBy: 'dialog-title', data: {
      title: `¿Archivar a ${person.displayName}?`, body: 'Se ocultará del selector. Sus datos y borradores se conservarán y podrás restaurar el perfil.', action: 'Archivar cliente',
    } });
    if (await firstValueFrom(ref.closed)) await this.workspace.archive(person.id, true);
  }
}
