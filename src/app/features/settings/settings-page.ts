import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Card } from '../../shared/ui/card';
import { Button } from '../../shared/ui/button';
import { WorkspaceStore } from '../people/workspace.store';
import { OfflineStatus, type OfflineState } from '../../core/pwa/offline-status';
import { AppUpdates } from '../../core/pwa/app-updates';
import { RouterLink } from '@angular/router';

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
     <app-card><h2>Créditos</h2><p class="muted">Aplicación desarrollada con Angular, Angular CDK, idb, Zod y herramientas gratuitas. Icono de marca original. Las ilustraciones usadas en PDF de rutinas incluyen sus créditos por imagen; los PDF de comidas y progreso usan solo texto y fuentes locales.</p></app-card>
  </div>` })
export class SettingsPage {
  protected readonly workspace = inject(WorkspaceStore);
  protected readonly offline = inject(OfflineStatus);
  protected readonly updates = inject(AppUpdates);
  protected readonly offlineLabels: Record<OfflineState, string> = {
    development: 'Modo de desarrollo: prueba el funcionamiento sin conexión con la compilación de producción.',
    unsupported: 'Este navegador o conexión no permite preparar el modo sin conexión.',
    preparing: 'Preparando y comprobando los recursos de esta entrega…',
    ready: 'Recursos de esta entrega disponibles sin conexión.',
    incomplete: 'Preparación incompleta. Conecta el dispositivo y vuelve a comprobar los recursos.',
  };
}
