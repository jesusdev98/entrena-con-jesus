import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { Button } from './button';

@Component({ selector: 'app-permanent-delete-dialog', imports: [Button],
  template: `<dialog #dialog class="delete-dialog" aria-labelledby="delete-title" aria-describedby="delete-reason" (cancel)="onCancel($event)" (close)="name.set('')">
    <h2 id="delete-title">Eliminar definitivamente {{ kind() }}: {{ name() }}</h2>
    <p id="delete-reason">Esta acción es irreversible: se eliminarán el plan, todas sus versiones y sus borradores. No podrás restaurarlo desde Archivados. Los entrenamientos y consumos reales guardados permanecerán en el historial.</p>
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    <div class="actions"><button appButton variant="secondary" autofocus [disabled]="busy()" (click)="cancel()">Cancelar</button>
      <button appButton variant="danger" [disabled]="busy()" (click)="confirmed.emit()">Eliminar definitivamente</button></div>
  </dialog>` })
export class PermanentDeleteDialog {
  readonly kind = input.required<string>(); readonly busy = input(false); readonly error = input(''); readonly confirmed = output<void>();
  readonly name = signal('');
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  open(name: string): void { if (this.busy()) return; this.name.set(name); this.dialog().nativeElement.showModal(); }
  close(): void { this.dialog().nativeElement.close(); }
  cancel(): void { if (!this.busy()) this.close(); }
  onCancel(event: Event): void { if (this.busy()) event.preventDefault(); }
}
