import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from '../../shared/ui/button';
import type { RowAction } from './routine-planning';

@Component({ selector: 'app-row-actions', imports: [Button], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="actions"><button type="button" appButton variant="secondary" [disabled]="first()" [attr.aria-label]="'Subir ' + label()" (click)="action.emit('up')">Subir</button>
    <button type="button" appButton variant="secondary" [disabled]="last()" [attr.aria-label]="'Bajar ' + label()" (click)="action.emit('down')">Bajar</button>
    <button type="button" appButton variant="secondary" [attr.aria-label]="'Duplicar ' + label()" (click)="action.emit('duplicate')">Duplicar</button>
    <button type="button" appButton variant="secondary" [attr.aria-label]="'Eliminar ' + label()" (click)="action.emit('remove')">Eliminar</button></div>`,
  styles: `:host { display: block; } button { padding: .55rem .7rem; }` })
export class RowActions {
  readonly label = input.required<string>(); readonly first = input(false); readonly last = input(false);
  readonly action = output<RowAction>();
}
