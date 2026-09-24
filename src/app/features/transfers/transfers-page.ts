import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Card } from '../../shared/ui/card';
import { Button } from '../../shared/ui/button';
import { WorkspaceStore } from '../people/workspace.store';
import { RoutinesRepository } from '../routines/routines.repository';
import { MealPlansRepository } from '../nutrition/meal-plans/meal-plans.repository';
import { ExerciseCatalogStore } from '../exercises/exercise-catalog.store';
import { FoodCatalogStore } from '../nutrition/foods/food-catalog.store';
import { MAX_PLAN_BYTES } from './transfer-schema';
import { PlanExchange, type Decision, type PlanKind, type PlanReview } from './plan-exchange';
import { ProgressExchange, type ProgressDecision, type ProgressReview } from './progress-exchange';
import { today } from '../progress/training-history';
import { shiftDate } from '../progress/training-history';
import { localDate } from '../../core/domain/identity';
import { storageFailure } from '../../core/storage/database';
import type { UUID } from '../../core/domain/identity';
import { BackupPanel } from './backup-panel';

@Component({ selector: 'app-transfers-page', imports: [Card, Button, BackupPanel], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack transfer-page"><header><p class="eyebrow">Intercambio manual</p><h1>Compartir planes</h1>
    <p>Archivos JSON de planes o progreso real. Entrenador y cliente se envían el archivo manualmente; no hay cuentas ni verificación de identidad.</p></header>
    <app-card><h2>Persona local seleccionada</h2><p><strong>{{ workspace.activePerson()?.displayName }}</strong> · {{ workspace.activePerson()?.reference || 'Sin referencia' }}</p>
      <p class="identity">ID: {{ workspace.activePerson()?.id }}</p><p class="muted">Antes de importar, selecciona la persona destinataria en el espacio de trabajo. Los nombres repetidos no vinculan personas.</p></app-card>
    <app-card><h2>Exportar un plan</h2><label for="transfer-plan">Plan guardado de esta persona</label>
      <select id="transfer-plan" [value]="selected()" (change)="selected.set($any($event.target).value)"><option value="">Selecciona un plan</option>
        @for (item of plans(); track item.key) { <option [value]="item.key">{{ item.label }}</option> }</select>
      <button appButton [disabled]="busy() || !selected()" (click)="download(selected())">Descargar JSON</button>
      <p class="muted">Incluye el plan elegido y sus alimentos o ejercicios personalizados necesarios. Las ilustraciones y catálogos incluidos en la aplicación se referencian por ID.</p></app-card>
    <app-card><h2>Importar y revisar</h2><label for="transfer-file">Archivo JSON recibido</label>
      <input id="transfer-file" type="file" accept=".json,application/json" [disabled]="busy()" (change)="pick($event)" />
      <p>Destino elegido: <strong>{{ workspace.activePerson()?.displayName }}</strong> · {{ workspace.activePerson()?.reference || 'Sin referencia' }} ({{ workspace.activePerson()?.id }})</p>
      @if (review(); as result) {
        <section class="review" aria-label="Revisión antes de importar">
          <h3>Revisión previa</h3><p>Origen declarado por el archivo: {{ result.file.sourcePerson.displayName }} · ID {{ result.file.sourcePerson.personId }} · espacio {{ result.file.sourcePerson.workspaceId }}.</p>
          <p>Exportación {{ result.file.exportId }} · {{ result.file.exportedAt }}. Esta referencia no demuestra quién creó el archivo.</p>
          <p>Versión recibida: {{ result.file.payload.plans[0].revisionId }} · base {{ result.file.payload.plans[0].parentRevisionId || 'sin base' }}.
            Versión local: {{ result.local?.id || 'ninguna' }} · origen vinculado {{ result.local?.exchange?.revisionId || 'local' }}.</p>
          @if (result.nativeSubject) { <p>Esta identidad del archivo corresponde a la persona local seleccionada.</p> }
          @else if (result.mappingId) { <p>La identidad externa ya está vinculada a esta persona local.</p> }
          @else { <p>Se creará el vínculo de identidad externa únicamente después de aplicar esta decisión.</p> }
          @if (result.divergent) { <p class="notice">Las revisiones divergen. Compara y decide; no se fusionarán automáticamente.</p> }
          @if (result.repeated) { <p>Esta revisión ya se importó. Aplicarla otra vez no duplicará el plan.</p> }
          <h4>Cambios ({{ result.differences.length }})</h4>
          @if (!result.differences.length) { <p>No hay cambios en los campos del plan.</p> }
          <div class="diff-list">@for (change of result.differences; track change.path) { <div class="diff-row"><strong>{{ change.path }}</strong>
            <span>Antes: {{ change.before }}</span><span>Recibido: {{ change.after }}</span></div> }</div>
          <fieldset><legend>Decisión para este plan</legend>
            <label><input type="radio" name="transfer-decision" value="accept" [checked]="decision() === 'accept'" (change)="decision.set('accept')" /> Aceptar revisión recibida</label>
            <label><input type="radio" name="transfer-decision" value="keep" [checked]="decision() === 'keep'" (change)="decision.set('keep')" /> Conservar original local</label>
            <label><input type="radio" name="transfer-decision" value="copy" [checked]="decision() === 'copy'" (change)="decision.set('copy')" /> Guardar copia independiente</label>
          </fieldset>
          <label><input type="checkbox" [checked]="confirmed()" (change)="confirmed.set($any($event.target).checked)" /> Confirmo el destino y esta decisión</label>
          <button appButton [disabled]="busy() || !confirmed() || workspace.activePerson()?.id !== result.destination" (click)="apply()">Aplicar decisión</button>
        </section>
      }
    </app-card>
    <app-card><h2>Exportar progreso real</h2><p>Incluye solo sesiones finalizadas y alimentos realmente registrados. Puede contener información de salud y comidas: elige deliberadamente a quién entregarás este archivo. No se sube a ningún servidor.</p>
      <label for="progress-from">Desde</label><input id="progress-from" type="date" [max]="today" [value]="from()" (change)="from.set($any($event.target).value)" />
      <label for="progress-through">Hasta</label><input id="progress-through" type="date" [max]="today" [value]="through()" (change)="through.set($any($event.target).value)" />
      <button appButton [disabled]="busy()" (click)="downloadProgress()">Descargar progreso JSON</button>
      <p class="muted">Máximo 31 días y 512 KiB por archivo. Los borradores, planes y objetivos diarios no se incluyen.</p></app-card>
    <app-card><h2>Importar progreso real</h2><label for="progress-file">Archivo de progreso JSON recibido</label>
      <input id="progress-file" type="file" accept=".json,application/json" [disabled]="busy()" (change)="pickProgress($event)" />
      <p>Destino local: <strong>{{ workspace.activePerson()?.displayName }}</strong> · {{ workspace.activePerson()?.reference || 'Sin referencia' }} · ID {{ workspace.activePerson()?.id }}.</p>
      @if (progressReview(); as result) { <section class="review" aria-label="Revisión de progreso antes de importar">
        <h3>Revisión del progreso</h3><p>Origen declarado: {{ result.file.sourcePerson.displayName }} · persona {{ result.file.sourcePerson.personId }} · espacio {{ result.file.sourcePerson.workspaceId }}.</p>
        <p>Archivo {{ result.file.exportId }} · {{ result.file.exportedAt }} · intervalo {{ result.file.from }} a {{ result.file.through }}. El ID no verifica identidad.</p>
        <p>{{ result.nativeSubject ? 'Origen local seleccionado' : result.mappingId ? 'Identidad externa ya vinculada a esta persona' : 'Se vinculará esta identidad externa solo al confirmar' }}.</p>
        <p>{{ result.file.payload.sessions.length }} sesiones finalizadas · {{ result.file.payload.foodLogs.length }} alimentos reales.</p>
        @for (row of result.records; track row.key) { <div class="diff-row" data-testid="progress-record"><h4>{{ row.kind === 'session' ? 'Sesión' : 'Alimento' }} · {{ row.date }} · {{ row.label }}</h4>
          <p>ID extranjero: {{ row.key }} · revisión recibida {{ row.revision }} · local {{ row.local?.id || 'ninguno' }} · {{ row.status === 'added' ? 'Se añadirá' : row.status === 'already-present' ? 'Ya está presente' : 'Conflicto: el registro cambió' }}.</p>
          @if (row.status === 'conflicting') { <fieldset><legend>Decisión para {{ row.key }}</legend>
            <label><input type="radio" [name]="row.key" value="keep" [checked]="progressDecisions()[row.key] === 'keep'" (change)="chooseProgress(row.key, 'keep')" /> Conservar registro local</label>
            <label><input type="radio" [name]="row.key" value="replace" [checked]="progressDecisions()[row.key] === 'replace'" (change)="chooseProgress(row.key, 'replace')" /> Reemplazar con recibido</label>
          </fieldset> }
          @if (row.differences.length) { <details><summary>Comparar fecha y métricas ({{ row.differences.length }})</summary>
            <div class="diff-list">@for (difference of row.differences; track difference.path) { <div class="diff-row"><strong>{{ difference.path }}</strong><span>Antes: {{ difference.before }}</span><span>Recibido: {{ difference.after }}</span></div> }</div>
          </details> }
        </div> }
        <label><input type="checkbox" [checked]="progressConfirmed()" (change)="progressConfirmed.set($any($event.target).checked)" /> Confirmo la persona destinataria y las decisiones del progreso</label>
        <button appButton [disabled]="busy() || !progressConfirmed() || workspace.activePerson()?.id !== result.destination || unresolved()" (click)="applyProgress()">Aplicar progreso revisado</button>
      </section> }
    </app-card><app-backup-panel /><p role="status">{{ message() }}</p><p role="alert">{{ error() }}</p></div>`,
  styles: `.transfer-page { min-width: 0; } .transfer-page app-card, .review, .diff-list { min-width: 0; }
    select, input[type=file] { display: block; max-width: 100%; width: 100%; padding: .65rem; margin: .5rem 0 1rem; }
    .review { overflow-wrap: anywhere; } .diff-list { max-height: 26rem; overflow: auto; border: 1px solid var(--line); border-radius: .7rem; margin: 1rem 0; }
    .diff-row { display: grid; gap: .25rem; border-bottom: 1px solid var(--line); padding: .7rem; overflow-wrap: anywhere; }
    .diff-row span { white-space: pre-wrap; } fieldset { border: 1px solid var(--line); margin: 1rem 0; }
    fieldset label { display: block; margin: .65rem 0; }` })
export class TransfersPage {
  protected readonly workspace = inject(WorkspaceStore);
  private readonly routines = inject(RoutinesRepository);
  private readonly meals = inject(MealPlansRepository);
  private readonly exercises = inject(ExerciseCatalogStore);
  private readonly foods = inject(FoodCatalogStore);
  private readonly exchange = inject(PlanExchange);
  private readonly progress = inject(ProgressExchange);
  protected readonly today = today();
  protected readonly from = signal<string>(shiftDate(today(), -6));
  protected readonly through = signal<string>(today());
  protected readonly progressReview = signal<ProgressReview | null>(null);
  protected readonly progressDecisions = signal<Record<string, ProgressDecision>>({});
  protected readonly progressConfirmed = signal(false);
  protected readonly unresolved = computed(() => this.progressReview()?.records.some(row => row.status === 'conflicting' && !this.progressDecisions()[row.key]) ?? false);
  protected readonly plans = signal<{ key: string; label: string }[]>([]);
  protected readonly selected = signal('');
  protected readonly review = signal<PlanReview | null>(null);
  protected readonly decision = signal<Decision>('accept');
  protected readonly confirmed = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  private readonly owner = computed(() => this.workspace.activePerson()?.id);
  constructor() {
    effect(() => {
      const id = this.owner();
      this.review.set(null); this.confirmed.set(false); this.progressReview.set(null); this.progressConfirmed.set(false);
      this.selected.set(''); this.plans.set([]);
      if (id) void this.refresh();
    });
  }
  private async resources(): Promise<void> {
    await Promise.all([this.exercises.load(), this.foods.load()]);
    if (this.exercises.status() !== 'ready' || this.foods.status() !== 'ready') throw new Error('Prepara los catálogos locales en Ajustes y vuelve a intentarlo.');
  }
  private async refresh(): Promise<void> {
    const id = this.owner(); if (!id) return;
    try {
      const [routines, meals] = await Promise.all([this.routines.list(id), this.meals.list(id)]);
      if (this.owner() !== id) return;
      this.selected.set('');
      this.plans.set([...routines.filter(item => !item.archived).map(item => ({ key: `routine:${item.planId}`, label: `Rutina · ${item.name}` })),
        ...meals.filter(item => !item.archived).map(item => ({ key: `meal-plan:${item.planId}`, label: `Comidas · ${item.name}` }))]);
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
  protected async download(key: string): Promise<void> {
    const id = this.owner(); if (!id || this.busy()) return;
    const [type, planId] = key.split(':') as [PlanKind, UUID];
    if (!['routine', 'meal-plan'].includes(type) || !this.plans().some(plan => plan.key === key)) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      await this.resources();
      const text = await this.exchange.export(id, type, planId, this.exercises.exercises(), this.foods.foods());
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `entrena-plan-${type}-${planId}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      this.message.set('Archivo JSON descargado. Compártelo manualmente con la persona indicada.');
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo exportar el plan.'); }
    finally { this.busy.set(false); }
  }
  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0];
    this.review.set(null); this.confirmed.set(false); this.message.set(''); this.error.set('');
    if (!file || this.busy()) return;
    const id = this.owner(); if (!id) return;
    this.busy.set(true);
    try {
      if (file.size > MAX_PLAN_BYTES) throw new Error('El archivo supera el límite de 512 KiB.');
      const text = await file.text(); await this.resources();
      const result = await this.exchange.review(text, id, this.exercises.exercises(), this.foods.foods());
      if (this.owner() !== id) throw new Error('La persona seleccionada cambió. Vuelve a elegir el archivo.');
      this.review.set(result); this.decision.set('accept');
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Archivo inválido.'); }
    finally { this.busy.set(false); input.value = ''; }
  }
  protected async apply(): Promise<void> {
    const review = this.review(); if (!review || !this.confirmed() || this.busy() || this.owner() !== review.destination) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await this.exchange.apply(review, this.decision()); this.review.set(null); this.confirmed.set(false);
      this.message.set('Decisión aplicada. La revisión anterior permanece en el historial local.'); await this.refresh(); }
    catch (error) { this.error.set(storageFailure(error).message); this.review.set(null); this.confirmed.set(false); }
    finally { this.busy.set(false); }
  }
  protected chooseProgress(key: string, value: ProgressDecision): void {
    this.progressDecisions.update(current => ({ ...current, [key]: value })); this.progressConfirmed.set(false);
  }
  protected async downloadProgress(): Promise<void> {
    const id = this.owner(); if (!id || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      const from = localDate(this.from()), through = localDate(this.through());
      await this.resources();
      const text = await this.progress.export(id, from, through, this.exercises.exercises(), this.foods.foods());
      if (this.owner() !== id) throw new Error('La persona seleccionada cambió. Vuelve a exportar.');
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `entrena-progreso-${from}-${through}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      this.message.set('Progreso descargado. Envíalo solo al destinatario previsto.');
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo exportar el progreso.'); }
    finally { this.busy.set(false); }
  }
  protected async pickProgress(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    this.progressReview.set(null); this.progressConfirmed.set(false); this.progressDecisions.set({}); this.error.set(''); this.message.set('');
    const id = this.owner(); if (!file || !id || this.busy()) return;
    this.busy.set(true);
    try {
      if (file.size > MAX_PLAN_BYTES) throw new Error('El archivo supera el límite de 512 KiB.');
      const text = await file.text(); await this.resources();
      const result = await this.progress.review(text, id, this.exercises.exercises(), this.foods.foods());
      if (this.owner() !== id) throw new Error('La persona seleccionada cambió. Vuelve a elegir el archivo.');
      this.progressReview.set(result);
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Archivo de progreso inválido.'); }
    finally { this.busy.set(false); input.value = ''; }
  }
  protected async applyProgress(): Promise<void> {
    const review = this.progressReview(); if (!review || !this.progressConfirmed() || this.unresolved() || this.busy() || this.owner() !== review.destination) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await this.progress.apply(review, this.progressDecisions()); this.message.set('Progreso aplicado. Consulta Progreso y Diario alimentario.'); }
    catch (error) { this.error.set(storageFailure(error).message); }
    finally { this.progressReview.set(null); this.progressConfirmed.set(false); this.busy.set(false); }
  }
}
