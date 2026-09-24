import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Button } from '../../../shared/ui/button';
import { FoodDetail } from './food-detail';
import type { FoodChoice } from './food.model';

export type FoodDetailAction = 'edit' | 'archive' | 'restore';
@Component({ selector: 'app-food-detail-dialog', imports: [Button, FoodDetail], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><div class="actions"><button appButton variant="secondary" (click)="ref.close()">Cerrar detalles</button></div>
    <h2 id="food-detail-title">{{ food.name }}</h2><app-food-detail [food]="food" />
    @if (food.kind === 'custom') {
      <div class="actions">@if (food.entry.archived) { <button appButton (click)="ref.close('restore')">Restaurar alimento</button> }
        @else { <button appButton (click)="ref.close('edit')">Editar alimento</button><button appButton variant="secondary" (click)="ref.close('archive')">Archivar alimento</button> }</div>
      <small>Los alimentos archivados se pueden restaurar desde el filtro de origen.</small>
    }</div>`,
  styles: `:host { display: block; width: min(36rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); overflow-y: auto;
    padding: 1.25rem; border-radius: var(--radius); background: var(--surface); box-shadow: 0 20px 80px #11182733; } h2 { overflow-wrap: anywhere; }` })
export class FoodDetailDialog {
  protected readonly food = inject<FoodChoice>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<FoodDetailAction>>(DialogRef);
}
