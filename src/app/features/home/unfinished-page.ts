import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Card } from '../../shared/ui/card';
import { Button } from '../../shared/ui/button';

@Component({ selector: 'app-unfinished-page', imports: [Card, Button, RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-card><p class="eyebrow">Área pendiente de implementación</p><h1>{{ title() }}</h1><p>Esta entrega incluye los perfiles, los modos y el almacenamiento local. Esta área todavía no permite crear planes ni registrar actividad.</p>
    <div class="actions">@if (feature() === 'routines') { <a appButton routerLink="/exercises">Explorar ejercicios</a> }
    <a appButton variant="secondary" routerLink="/">Volver al inicio</a></div></app-card>` })
export class UnfinishedPage {
  readonly feature = input('');
  protected readonly title = computed(() => ({ routines: 'Rutinas', nutrition: 'Alimentación', progress: 'Progreso' })[this.feature()] ?? 'Próximamente');
}
