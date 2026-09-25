import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, inject, input, signal, viewChild } from '@angular/core';
import { Button } from '../../shared/ui/button';
import { RouterLink } from '@angular/router';
import { Card } from '../../shared/ui/card';
import { newId, type UUID } from '../../core/domain/identity';
import { storageFailure } from '../../core/storage/database';
import type { Person } from '../people/person.model';
import type { RoutineRevision } from './routine.model';
import { RoutinesRepository, type RoutineDraft } from './routines.repository';
import { duplicateContent } from './routine-planning';
import { RoutineEditor } from './routine-editor';
import { PermanentDeleteDialog } from '../../shared/ui/permanent-delete-dialog';

@Component({ selector: 'app-person-routines', imports: [Button, Card, RoutineEditor, RouterLink, PermanentDeleteDialog], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><section class="notice"><h2>Rutinas de {{ person().displayName }}</h2><p>{{ person().reference || 'Espacio local' }}</p></section>
    <app-permanent-delete-dialog #deleteDialog kind="la rutina" [busy]="busy()" [error]="error()" (confirmed)="deleteSelected()" />
    @if (message()) { <p role="status">{{ message() }}</p> }
    @if (readyPdf()) { <button appButton variant="secondary" [disabled]="pdfBusy()" (click)="shareOrOpenPdf()">Abrir o compartir último PDF</button> }
    @if (error()) { <div class="error" role="alert"><p>{{ error() }}</p><button appButton variant="secondary" (click)="load()">Actualizar lista</button></div> }
    @for (entry of editor() ? [editor()!] : []; track entry.key) {
      <app-routine-editor [personId]="person().id" [editorKey]="entry.key" [planId]="entry.planId" (saved)="onSaved()" (closed)="close()" />
    }
    @if (!editor()) {
      <button #newButton appButton [disabled]="loading() || busy()" (click)="open('routine:new')">Crear rutina / recuperar nueva</button>
      @if (loading()) { <p role="status">Cargando rutinas…</p> }
      @if (drafts().length) { <section class="stack" aria-label="Borradores de rutinas"><h2>Borradores pendientes</h2><p>No cuentan como planes válidos guardados.</p>
        @for (draft of drafts(); track draft.id) { <button appButton variant="secondary" (click)="open(draft.editorKey, draft.payload.planId)">Recuperar borrador: {{ draft.payload.name || 'Sin nombre' }}</button> }
      </section> }
      <div class="actions"><button appButton variant="secondary" (click)="archived.set(!archived())">{{ archived() ? 'Ver rutinas activas' : 'Ver rutinas archivadas' }}</button></div>
      <h2>{{ archived() ? 'Rutinas archivadas' : 'Rutinas guardadas' }}</h2>
      @for (routine of routines(); track routine.planId) { @if (!!routine.archived === archived()) {
        <app-card><article class="stack" data-testid="routine-card"><h3>{{ routine.name }}</h3><p>{{ routine.content.weeks.length }} semanas · Plan validado</p>
          <div class="actions">@if (!routine.archived) { <button appButton [disabled]="busy()" (click)="open('routine:' + routine.planId, routine.planId)">Editar {{ routine.name }}</button>
            <a appButton variant="secondary" routerLink="/training" [queryParams]="{ revision: routine.id }">Entrenar {{ routine.name }}</a> }
             @if (!routine.archived) { <button appButton variant="secondary" [disabled]="busy() || pdfBusy()" (click)="exportPdf(routine)">Descargar PDF de {{ routine.name }}</button> }
             <button appButton variant="secondary" [disabled]="busy() || pdfBusy()" (click)="duplicate(routine)">Duplicar {{ routine.name }}</button>
             <button appButton variant="secondary" [disabled]="busy() || pdfBusy()" (click)="archive(routine)">{{ routine.archived ? 'Restaurar' : 'Archivar' }} {{ routine.name }}</button>
             <button appButton variant="danger" [disabled]="busy() || pdfBusy()" (click)="confirmDelete(routine)">Eliminar definitivamente {{ routine.name }}</button>
           </div></article></app-card>
      } }
       @if (!loading() && !routines().some(routine => !!routine.archived === archived())) {
         <div class="notice"><p>{{ archived() ? 'No hay rutinas archivadas. Vuelve a las rutinas activas o crea una nueva.' : 'No hay rutinas guardadas para esta persona. Crea una rutina válida para empezar a entrenar.' }}</p>
           <button appButton variant="secondary" (click)="archived() ? archived.set(false) : open('routine:new')">{{ archived() ? 'Ver rutinas activas' : 'Crear primera rutina' }}</button></div>
       }
    }
  </div>` })
export class PersonRoutines implements OnInit {
  readonly person = input.required<Person>();
  private readonly repository = inject(RoutinesRepository);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly newButton = viewChild<ElementRef<HTMLButtonElement>>('newButton');
  private readonly deleteDialog = viewChild.required<PermanentDeleteDialog>('deleteDialog');
  private selected: RoutineRevision | null = null;
  readonly routines = signal<RoutineRevision[]>([]); readonly drafts = signal<RoutineDraft[]>([]);
  readonly loading = signal(true); readonly busy = signal(false); readonly error = signal(''); readonly message = signal(''); readonly archived = signal(false);
  readonly pdfBusy = signal(false);
  readonly readyPdf = signal<{ blob: Blob; filename: string; planId: UUID; revisionId: UUID } | null>(null);
  readonly editor = signal<{ key: string; planId?: UUID } | null>(null);
  private owner!: UUID;
  ngOnInit(): void { this.owner = this.person().id; void this.load(); this.destroy.onDestroy(() => this.readyPdf.set(null)); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const [routines, drafts] = await Promise.all([this.repository.list(this.owner), this.repository.listDrafts(this.owner)]);
      if (!this.destroy.destroyed) { this.routines.set(routines); this.drafts.set(drafts); }
    } catch (error) { this.error.set(storageFailure(error).message); }
    finally { this.loading.set(false); }
  }
  open(key: string, planId?: UUID): void { this.message.set(''); this.editor.set({ key, planId }); }
  async exportPdf(routine: RoutineRevision): Promise<void> {
    if (this.pdfBusy() || routine.personId !== this.owner || routine.archived) return;
    this.pdfBusy.set(true); this.readyPdf.set(null); this.error.set(''); this.message.set('Preparando PDF de la revisión guardada…');
    try {
      // Read the selected saved revision again, never an unfinished editor draft.
      const saved = await this.repository.latest(this.owner, routine.planId);
      if (!saved || saved.id !== routine.id || saved.archived) throw new Error('La revisión guardada ya no está disponible.');
      const { exportRoutinePdf, routinePdfFilename, downloadPdf } = await import('../pdf/pdf-export');
      const { blob, rasterFallback } = await exportRoutinePdf(this.person(), saved);
      if (this.destroy.destroyed || this.person().id !== this.owner) return;
      if ((await this.repository.latest(this.owner, routine.planId))?.id !== saved.id) throw new Error('La revisión guardada ya no está disponible.');
      const filename = routinePdfFilename(saved);
      this.readyPdf.set({ blob, filename, planId: saved.planId, revisionId: saved.id }); downloadPdf(blob, filename);
      this.message.set(rasterFallback ? 'PDF descargado. Las ilustraciones se convirtieron localmente a imagen para conservar su contenido.' : 'PDF descargado.');
    } catch (error) { this.message.set(''); this.error.set(error instanceof Error ? error.message : 'No se pudo generar el PDF.'); }
    finally { this.pdfBusy.set(false); }
  }
  async shareOrOpenPdf(): Promise<void> {
    const pdf = this.readyPdf(); if (!pdf) return;
    try {
      const current = await this.repository.latest(this.owner, pdf.planId);
      if (!current || current.id !== pdf.revisionId || current.archived) { this.readyPdf.set(null); throw new Error('La revisión guardada ya no está disponible.'); }
      const file = new File([pdf.blob], pdf.filename, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) { await navigator.share({ files: [file], title: pdf.filename }); return; }
      const url = URL.createObjectURL(pdf.blob);
      const opened = window.open(url, '_blank');
      if (opened) opened.opener = null;
      if (!opened) { const { downloadPdf } = await import('../pdf/pdf-export'); downloadPdf(pdf.blob, pdf.filename); }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { if ((error as Error).name !== 'AbortError') this.error.set(error instanceof Error ? error.message : 'No se pudo compartir el PDF.'); }
  }
  async duplicate(routine: RoutineRevision): Promise<void> {
    if (this.busy() || this.pdfBusy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const planId = newId(); const now = new Date().toISOString(); const key = `routine:${planId}`;
      const draft: RoutineDraft = { id: newId(), personId: this.owner, editorKey: key, createdAt: now, updatedAt: now,
        payload: { kind: 'routine', planId, baseRevisionId: null, name: `${routine.name} (copia)`.slice(0, 160), content: duplicateContent(routine.content) } };
      await this.repository.saveDraft(this.owner, draft, null);
      if (!this.destroy.destroyed) this.open(key, planId);
    } catch (error) { this.error.set(storageFailure(error).message); }
    finally { this.busy.set(false); }
  }
  async archive(routine: RoutineRevision): Promise<void> {
    if (this.busy() || this.pdfBusy()) return;
    this.busy.set(true); this.error.set('');
    try { await this.repository.setArchived(this.owner, routine, !routine.archived); this.readyPdf.set(null); await this.load(); this.message.set(routine.archived ? 'Rutina restaurada.' : 'Rutina archivada. Puedes restaurarla desde Archivadas.'); }
    catch (error) { this.error.set(storageFailure(error).message); }
    finally { this.busy.set(false); }
  }
  confirmDelete(routine: RoutineRevision): void {
    if (this.busy() || this.pdfBusy() || routine.personId !== this.owner) return;
    this.error.set(''); this.selected = routine; this.deleteDialog().open(routine.name);
  }
  async deleteSelected(): Promise<void> {
    const routine = this.selected;
    if (!routine || this.busy() || this.pdfBusy()) return;
    this.busy.set(true); this.error.set('');
    try {
      await this.repository.deletePermanently(this.owner, routine);
      this.readyPdf.set(null); this.deleteDialog().close(); this.selected = null;
      await this.load(); this.message.set('Rutina eliminada definitivamente. Los entrenamientos reales guardados permanecen en el historial.'); this.focusCreate();
    } catch (error) { this.error.set(storageFailure(error).message); }
    finally { this.busy.set(false); }
  }
  async close(): Promise<void> { this.editor.set(null); await this.load(); this.focusCreate(); }
  async onSaved(): Promise<void> { await this.close(); this.message.set('Rutina válida guardada en esta persona.'); }
  private focusCreate(): void { if (!this.destroy.destroyed) afterNextRender(() => this.newButton()?.nativeElement.focus(), { injector: this.injector }); }
}
