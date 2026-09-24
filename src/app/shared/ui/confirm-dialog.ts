import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Button } from './button';

export interface ConfirmData { title: string; body: string; action: string }
@Component({ selector: 'app-confirm-dialog', imports: [Button], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2 id="dialog-title">{{ data.title }}</h2><p>{{ data.body }}</p><div class="actions">
    <button appButton variant="secondary" (click)="ref.close(false)">Cancelar</button>
    <button appButton (click)="ref.close(true)">{{ data.action }}</button></div>`,
  styles: ':host { display: block; width: min(28rem, calc(100vw - 2rem)); padding: 1.75rem; border-radius: var(--radius); background: var(--surface); box-shadow: 0 20px 80px #11182733; }' })
export class ConfirmDialog { protected readonly data = inject<ConfirmData>(DIALOG_DATA); protected readonly ref = inject<DialogRef<boolean>>(DialogRef); }
