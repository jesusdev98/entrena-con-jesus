import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Card } from '../../shared/ui/card';
import { Button } from '../../shared/ui/button';
import { BackupExchange, type BackupReview } from './backup-exchange';
import { MAX_BACKUP_BYTES } from './backup-schema';
import { reviewLabel } from './review-display';

const storeLabels: Record<string, string> = {
  settings: 'Configuración del espacio', people: 'Personas', profileRevisions: 'Versiones de perfil',
  customExercises: 'Ejercicios personalizados', customFoods: 'Alimentos personalizados',
  routineRevisions: 'Versiones de rutinas', mealPlanRevisions: 'Versiones de planes de comidas',
  trainingSessions: 'Entrenamientos reales', foodLogs: 'Alimentos consumidos', dailySnapshots: 'Objetivos diarios',
  mealConsumptions: 'Comidas marcadas como consumidas', drafts: 'Borradores', externalSubjects: 'Vínculos de origen externo',
};

@Component({ selector: 'app-backup-panel', imports: [Card, Button], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-card><h2>Copia completa de este dispositivo</h2>
    <p>Contiene perfiles, clientes, ajustes, planes y revisiones, entrenamientos, comidas, objetivos, borradores y vínculos externos de todas las personas de este navegador.</p>
    <p class="notice">El archivo contiene datos privados de salud y alimentación. Protégelo y guárdalo en un lugar seguro; no se sube a ningún servidor.</p>
    <button appButton [disabled]="busy()" (click)="download()">Descargar copia completa JSON</button>
    <h3>Restaurar reemplazando todo</h3>
    <p>La restauración REEMPLAZA todos los datos personales locales de este dispositivo, incluso los borradores. No fusiona personas por nombre. Los catálogos e imágenes incluidos con la aplicación permanecen intactos.</p>
    <label for="backup-file">Archivo de copia completa JSON</label>
    <input id="backup-file" type="file" accept=".json,application/json" [disabled]="busy()" (change)="pick($event)" />
    @if (review(); as value) { <section class="backup-review" aria-label="Revisar reemplazo de datos">
       <h3>Revisión antes de reemplazar</h3><p>Archivo creado: {{ value.file.exportedAt }}. La procedencia del archivo no está verificada.</p>
       <p>Personas en el archivo ({{ value.people.length }}):</p><ul>@for (person of value.people; track person.id) {
         <li>{{ backupPerson(person, value.people) }}</li> }</ul>
       <p>Registros que se reemplazarán (archivo / locales):</p><ul>@for (row of value.counts; track row.store) {
         <li>{{ storeLabel(row.store) }}: {{ row.incoming }} / {{ row.existing }}</li> }</ul>
      <label><input type="checkbox" [checked]="confirmed()" (change)="confirmed.set($any($event.target).checked)" /> Confirmo que esta copia reemplazará todos los datos personales locales</label>
      <div class="actions"><button appButton variant="secondary" [disabled]="busy()" (click)="cancel()">Cancelar restauración</button>
        <button appButton [disabled]="busy() || !confirmed()" (click)="restore()">Restaurar y reemplazar datos</button></div>
    </section> }
    <p role="status">{{ message() }}</p>@if (error()) { <p role="alert">{{ error() }}</p> }
  </app-card>`,
  styles: `app-card { display: block; min-width: 0; overflow-wrap: anywhere; } input[type=file] { display: block; max-width: 100%; width: 100%; margin: .5rem 0 1rem; } .backup-review { min-width: 0; overflow-wrap: anywhere; } li { margin: .3rem 0; }` })
export class BackupPanel {
  private readonly exchange = inject(BackupExchange);
  protected readonly busy = signal(false);
  protected readonly review = signal<BackupReview | null>(null);
  protected readonly confirmed = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected storeLabel(store: string): string { return storeLabels[store] ?? 'Otros registros'; }
  protected backupPerson(person: BackupReview['people'][number], people: BackupReview['people']): string {
    const same = people.filter(item => item.kind === person.kind && item.name.localeCompare(person.name, 'es', { sensitivity: 'base' }) === 0)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const role = person.kind === 'personal' ? 'Mi espacio' : 'Cliente';
    return `${reviewLabel(person.name)} · ${role}${same.length > 1 ? ` ${same.findIndex(item => item.id === person.id) + 1}` : ''}`;
  }
  protected cancel(): void { this.review.set(null); this.confirmed.set(false); this.message.set('Restauración cancelada. No se modificó ningún dato.'); }
  protected async download(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('Preparando copia completa…');
    try {
      const text = await this.exchange.export();
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'entrena-copia-completa.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      this.message.set('Copia completa descargada. Protege el archivo.');
    } catch (error) { this.message.set(''); this.error.set(error instanceof Error ? error.message : 'No se pudo crear la copia.'); }
    finally { this.busy.set(false); }
  }
  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    this.review.set(null); this.confirmed.set(false); this.message.set(''); this.error.set('');
    if (!file || this.busy()) return;
    this.busy.set(true); this.message.set('Validando todos los registros…');
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('La copia supera el límite de 20 MiB.');
      this.review.set(await this.exchange.review(await file.text())); this.message.set('Revisa las personas y cantidades antes de confirmar.');
    } catch (error) { this.message.set(''); this.error.set(error instanceof Error ? error.message : 'Archivo inválido.'); }
    finally { this.busy.set(false); input.value = ''; }
  }
  protected async restore(): Promise<void> {
    const value = this.review(); if (!value || !this.confirmed() || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('Reemplazando datos en una sola operación…');
    try {
      await this.exchange.restore(value);
      this.review.set(null); this.confirmed.set(false);
      this.message.set('Datos restaurados. Actualizando el espacio de trabajo…');
      // Recreate every feature store/editor from the restored settings and owner, including draft state.
      location.reload();
    } catch (error) { this.message.set(''); this.error.set(error instanceof Error ? error.message : 'La restauración falló. Los datos anteriores se conservaron.'); }
    finally { this.busy.set(false); }
  }
}
