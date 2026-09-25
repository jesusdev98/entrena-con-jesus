import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Card } from '../../shared/ui/card';
import { Button } from '../../shared/ui/button';
import { WorkspaceStore } from '../people/workspace.store';
import { OfflineStatus, type OfflineState } from '../../core/pwa/offline-status';
import { AppUpdates } from '../../core/pwa/app-updates';
import { RouterLink } from '@angular/router';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { storageFailure } from '../../core/storage/database';
import { DemoCleanup, type DemoCleanupReview } from '../demo/demo-cleanup';

@Component({ selector: 'app-settings-page', imports: [Card, Button, RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><header><p class="eyebrow">Tu espacio, tus ajustes</p><h1>Todo empieza por ti.</h1></header>
    <app-card><h2>Modo de uso</h2><p class="muted">Cambiar de modo adapta la navegación. Tus clientes, perfiles y borradores se conservan.</p>
      <p>Modo actual: <strong>{{ workspace.isTrainer() ? 'Entrenador' : 'Cliente' }}</strong></p>
      <div class="actions"><button appButton [variant]="workspace.isTrainer() ? 'primary' : 'secondary'" [attr.aria-pressed]="workspace.isTrainer()" [disabled]="workspace.busy()" (click)="workspace.changeMode('trainer')">Entrenador</button>
      <button appButton [variant]="!workspace.isTrainer() ? 'primary' : 'secondary'" [attr.aria-pressed]="!workspace.isTrainer()" [disabled]="workspace.busy()" (click)="workspace.changeMode('client')">Cliente</button></div></app-card>
    <app-card><h2>Disponibilidad sin conexión</h2><p role="status">{{ offlineLabels[offline.state()] }} @if (offline.state() === 'preparing' && offline.progress(); as progress) { {{ progress.cached }} de {{ progress.total }} recursos comprobados. }</p>
       <p class="muted">Esta comprobación incluye catálogos, fuentes locales y recursos para generar PDF sin conexión. El primer acceso requiere conexión.</p>
      <div class="actions"><button appButton variant="secondary" (click)="offline.verify()">Comprobar recursos</button><button appButton variant="secondary" (click)="updates.check()">Buscar actualización</button></div>
      <p class="muted">Para instalar, utiliza la opción de instalar o añadir a inicio de tu navegador cuando esté disponible.</p></app-card>
    <app-card><h2>Compartir y proteger datos</h2><p>Intercambia planes o progreso y descarga o restaura una copia completa de los datos personales de este dispositivo.</p><a routerLink="/transfers">Abrir intercambio y copias completas →</a></app-card>
     <app-card><h2>Conservar el espacio local</h2><p class="muted">Los datos pertenecen a este navegador y esta dirección web. Solicitar almacenamiento persistente reduce el riesgo de que el navegador los retire por falta de espacio.</p>
       <button appButton variant="secondary" (click)="offline.requestPersistence()">Solicitar almacenamiento persistente</button><p role="status">{{ offline.persistenceMessage() }}</p>
       <p class="notice">Haz una copia completa y protégela antes de borrar los datos del navegador.</p></app-card>
     @if (workspace.settings()?.demoSeed?.status === 'seeded') {
       <app-card><h2>Datos de demostración</h2>
         @if (workspace.settings()?.demoSeed?.receipt) {
           <p class="muted">Puedes quitar únicamente los registros creados al iniciar este espacio. Eliminar una rutina o un plan por separado conserva los entrenamientos y consumos reales.</p>
           <button appButton variant="danger" [disabled]="clearing()" (click)="openDemoCleanup()">Eliminar datos demo</button>
         } @else { <p class="muted">Esta demostración se creó antes de registrar las identidades necesarias para eliminarla sin afectar tus datos. Puedes gestionar cada registro por separado.</p> }
       </app-card>
     }
     @if (demoMessage()) { <p role="status">{{ demoMessage() }}</p> }
     <dialog #clearDialog class="delete-dialog" aria-labelledby="clear-demo-title" aria-describedby="clear-demo-reason" (cancel)="onCancelDemo($event)">
       <h2 id="clear-demo-title">Eliminar datos demo</h2>
       <p id="clear-demo-reason">Esta acción es irreversible. Quita los planes de prueba y sus versiones, entrenamientos, alimentos consumidos y objetivos diarios creados por la demostración. No elimina otros datos que agregaste ni vuelve a crear la demostración.</p>
       @if (review()?.edited) { <p class="notice">Los planes o registros demo se modificaron: también se eliminarán sus cambios guardados.</p> }
       @if (review()?.drafts) { <p role="alert">Hay borradores relacionados con datos demo. Ciérralos o resuélvelos antes de eliminar.</p> }
       @if (review()?.linked) { <p role="alert">Hay registros nuevos vinculados a datos demo. Revisa o elimina esos vínculos antes de continuar.</p> }
       @if (demoError()) { <p class="error" role="alert">{{ demoError() }}</p> }
       <div class="actions"><button appButton variant="secondary" autofocus [disabled]="clearing()" (click)="closeDemo()">Cancelar</button>
         <button appButton variant="danger" [disabled]="clearing() || review()?.drafts || review()?.linked" (click)="clearDemo()">Eliminar datos demo definitivamente</button></div>
     </dialog>
      <app-card><h2>Créditos</h2><p class="muted">Aplicación desarrollada con Angular, Angular CDK, idb, Zod y herramientas gratuitas. Icono de marca original. Las ilustraciones usadas en PDF de rutinas incluyen sus créditos por imagen; los PDF de comidas y progreso usan solo texto y fuentes locales.</p></app-card>
  </div>` })
export class SettingsPage {
  protected readonly workspace = inject(WorkspaceStore);
  protected readonly offline = inject(OfflineStatus);
  protected readonly updates = inject(AppUpdates);
  private readonly demo = inject(DemoCleanup);
  private readonly drafts = inject(DraftCoordinator);
  private readonly clearDialog = viewChild.required<ElementRef<HTMLDialogElement>>('clearDialog');
  protected readonly review = signal<DemoCleanupReview | null>(null);
  protected readonly demoError = signal('');
  protected readonly demoMessage = signal('');
  protected readonly clearing = signal(false);
  protected async openDemoCleanup(): Promise<void> {
    this.demoError.set(''); this.demoMessage.set('');
    if (!await this.drafts.flush()) { this.demoMessage.set('Guarda los borradores pendientes antes de eliminar datos demo.'); return; }
    try { this.review.set(await this.demo.review()); this.clearDialog().nativeElement.showModal(); }
    catch (error) { this.demoMessage.set(storageFailure(error).message); }
  }
  protected closeDemo(): void { if (!this.clearing()) this.clearDialog().nativeElement.close(); }
  protected onCancelDemo(event: Event): void { if (this.clearing()) event.preventDefault(); }
  protected async clearDemo(): Promise<void> {
    const review = this.review(); if (!review || this.clearing()) return;
    this.clearing.set(true); this.demoError.set('');
    try {
      if (!await this.drafts.flush()) throw new Error('Guarda los borradores pendientes antes de eliminar datos demo.');
      await this.demo.clear(review);
      this.clearDialog().nativeElement.close();
      await this.workspace.refresh();
      this.demoMessage.set('Datos demo eliminados. No volverán a aparecer.');
    } catch (error) { this.demoError.set(storageFailure(error).message); }
    finally { this.clearing.set(false); }
  }
  protected readonly offlineLabels: Record<OfflineState, string> = {
    development: 'Modo de desarrollo: prueba el funcionamiento sin conexión con la compilación de producción.',
    unsupported: 'Este navegador o conexión no permite preparar el modo sin conexión.',
    preparing: 'Preparando y comprobando los recursos de esta entrega…',
    ready: 'Recursos de esta entrega disponibles sin conexión.',
    incomplete: 'Preparación incompleta. Conecta el dispositivo y vuelve a comprobar los recursos.',
  };
}
