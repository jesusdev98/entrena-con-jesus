import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { newId, type UUID } from '../../../core/domain/identity';
import { storageFailure } from '../../../core/storage/database';
import type { Person } from '../../people/person.model';
import type { MealPlanRevision } from '../nutrition.model';
import { duplicateContent } from './meal-planning';
import { MealPlansRepository, type MealPlanDraft } from './meal-plans.repository';
import { MealEditor } from './meal-editor';
import { DailyTargetRepository } from '../../activity/daily-target.repository';
import { today } from '../../activity/daily-target.model';
import { localDate } from '../../../core/domain/identity';
import { ProgressExport, pdfFilename } from '../../pdf/progress-export';

@Component({ selector: 'app-person-meal-plans', imports: [RouterLink, Button, Card, MealEditor], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><section class="notice"><h2>Planes de {{ person().displayName }}</h2>
      <p>{{ person().reference || 'Espacio local' }}</p><p class="identity">ID de la persona: {{ person().id }}</p></section>
    @if (message()) { <p role="status">{{ message() }}</p> }
    @if (pdf.message()) { <p role="status">{{ pdf.message() }}</p> }
    @if (pdf.error()) { <p role="alert" class="error">{{ pdf.error() }}</p> }
    @if (pdf.ready()?.owner === person().id && pdf.ready()?.selection?.startsWith('meal:') && pdf.ready()?.selection?.endsWith(':' + pdfDate())) { <button appButton variant="secondary" [disabled]="pdf.busy()" (click)="pdf.share(person().id, pdf.ready()!.selection)">Abrir o compartir último PDF de comidas</button> }
    @if (error()) { <div class="error" role="alert"><p>{{ error() }}</p><button appButton variant="secondary" (click)="load()">Actualizar lista</button></div> }
    @for (entry of editor() ? [editor()!] : []; track entry.key) {
      <app-meal-editor [personId]="person().id" [editorKey]="entry.key" [planId]="entry.planId" (saved)="onSaved()" (closed)="close()" />
    }
    @if (!editor()) {
      <button #newButton appButton [disabled]="loading() || busy()" (click)="open('meal-plan:new')">Crear plan semanal / recuperar nuevo</button>
      @if (loading()) { <p role="status">Cargando planes…</p> }
      @if (drafts().length) { <section class="stack" aria-label="Borradores de planes de comidas"><h2>Borradores pendientes</h2><p>No cuentan como planes guardados.</p>
        @for (draft of drafts(); track draft.id) { <button appButton variant="secondary" (click)="open(draft.editorKey, draft.payload.planId)">Recuperar borrador: {{ draft.payload.name || 'Sin nombre' }}</button> }
      </section> }
      <div class="actions"><button appButton variant="secondary" (click)="archived.set(!archived())">{{ archived() ? 'Ver planes activos' : 'Ver planes archivados' }}</button></div>
      <h2>{{ archived() ? 'Planes archivados' : 'Planes guardados' }}</h2>
      <div class="field"><label for="meal-pdf-date">Fecha de objetivo guardado como referencia indicativa (opcional)</label><input id="meal-pdf-date" type="date" [value]="pdfDate()" (change)="pdfDate.set($any($event.target).value)" /></div>
      <p>El plan semanal no tiene fechas asignadas y no cuenta como consumo. Descarga solo revisiones guardadas.</p>
      @for (plan of plans(); track plan.planId) { @if (!!plan.archived === archived()) {
        <app-card><article class="stack" data-testid="meal-plan-card"><h3>{{ plan.name }}</h3><p>{{ plan.content.weeks.length }} semanas · Planificado, no consumido</p>
          <div class="actions">@if (!plan.archived) { <button appButton [disabled]="busy()" (click)="open('meal-plan:' + plan.planId, plan.planId)">Editar {{ plan.name }}</button> }
             <button appButton variant="secondary" [disabled]="busy()" (click)="duplicate(plan)">Duplicar {{ plan.name }}</button>
             <button appButton variant="secondary" [disabled]="busy() || pdf.busy()" (click)="exportPdf(plan)">Descargar PDF del plan {{ plan.name }}</button>
            <button appButton variant="secondary" [disabled]="busy()" (click)="archive(plan)">{{ plan.archived ? 'Restaurar' : 'Archivar' }} {{ plan.name }}</button>
          </div></article></app-card>
      } }
      @if (!loading() && !plans().some(plan => !!plan.archived === archived())) { <p>No hay planes {{ archived() ? 'archivados' : 'guardados' }} para esta persona.</p> }
      <a routerLink="/nutrition">Explorar alimentos y crear personalizados</a>
    }
  </div>` })
export class PersonMealPlans implements OnInit {
  readonly person = input.required<Person>();
  private readonly repository = inject(MealPlansRepository);
  private readonly targets = inject(DailyTargetRepository);
  readonly pdf = inject(ProgressExport); readonly pdfDate = signal(today());
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly newButton = viewChild<ElementRef<HTMLButtonElement>>('newButton');
  readonly plans = signal<MealPlanRevision[]>([]); readonly drafts = signal<MealPlanDraft[]>([]);
  readonly loading = signal(true); readonly busy = signal(false); readonly error = signal(''); readonly message = signal(''); readonly archived = signal(false);
  readonly editor = signal<{ key: string; planId?: UUID } | null>(null);
  private owner!: UUID;
  ngOnInit(): void { this.owner = this.person().id; void this.load(); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const [plans, drafts] = await Promise.all([this.repository.list(this.owner), this.repository.listDrafts(this.owner)]);
      if (!this.destroy.destroyed) { this.plans.set(plans); this.drafts.set(drafts); }
    } catch (error) { this.error.set(storageFailure(error).message); }
    finally { this.loading.set(false); }
  }
  open(key: string, planId?: UUID): void { this.message.set(''); this.editor.set({ key, planId }); }
  async exportPdf(plan: MealPlanRevision): Promise<void> {
    if (plan.personId !== this.person().id) return;
    const owner = this.person().id, date = this.pdfDate(), selected = `meal:${plan.id}:${date}`;
    await this.pdf.run(owner, selected, () => this.person().id === owner && this.pdfDate() === date,
      pdfFilename('comidas', plan.name, plan.id), async person => {
        const parsed = localDate(date);
        const [revision, target] = await Promise.all([this.repository.history(owner).then(all => all.find(item => item.id === plan.id)), this.targets.get(owner, parsed)]);
        if (!revision || revision.personId !== owner) throw new Error('La revisión guardada ya no está disponible.');
        const { mealDocument } = await import('../../pdf/meal-document');
        const { renderPdf } = await import('../../pdf/pdf-export');
        return renderPdf(mealDocument(person, structuredClone(revision), target ? structuredClone(target) : null));
      });
  }
  async duplicate(plan: MealPlanRevision): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const planId = newId(); const now = new Date().toISOString(); const key = `meal-plan:${planId}`;
      const draft: MealPlanDraft = { id: newId(), personId: this.owner, editorKey: key, createdAt: now, updatedAt: now,
        payload: { kind: 'meal-plan', planId, baseRevisionId: null, name: `${plan.name} (copia)`.slice(0, 160), content: duplicateContent(plan.content) } };
      await this.repository.saveDraft(this.owner, draft, null);
      if (!this.destroy.destroyed) this.open(key, planId);
    } catch (error) { this.error.set(storageFailure(error).message); }
    finally { this.busy.set(false); }
  }
  async archive(plan: MealPlanRevision): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await this.repository.setArchived(this.owner, plan, !plan.archived); await this.load(); this.message.set(plan.archived ? 'Plan restaurado.' : 'Plan archivado. Puedes restaurarlo desde Archivados.'); }
    catch (error) { this.error.set(storageFailure(error).message); }
    finally { this.busy.set(false); }
  }
  async close(): Promise<void> { this.editor.set(null); await this.load(); this.focusCreate(); }
  async onSaved(): Promise<void> { await this.close(); this.message.set('Plan de comidas guardado en esta persona.'); }
  private focusCreate(): void { if (!this.destroy.destroyed) afterNextRender(() => this.newButton()?.nativeElement.focus(), { injector: this.injector }); }
}
