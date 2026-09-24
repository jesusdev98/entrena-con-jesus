import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { PersonEditor } from '../people/person-editor';
import { WorkspaceStore } from '../people/workspace.store';
import type { AppMode } from '../people/person.model';

@Component({ selector: 'app-onboarding-page', imports: [Icon, PersonEditor], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="onboarding stack"><div><p class="eyebrow">Tu punto de partida</p><h1>Un espacio para<br />entrenar a tu manera.</h1>
    <p class="muted">Organiza tu acompañamiento o empieza contigo. Sin cuentas, con tus datos en este dispositivo.</p></div>
    <fieldset><legend>¿Cómo vas a usar Entrena con Jesús?</legend><div class="grid">
      <label class="mode" [class.selected]="mode() === 'trainer'"><input type="radio" name="mode" value="trainer" [checked]="mode() === 'trainer'" (change)="mode.set('trainer')" />
        <app-icon name="people" /><strong>Entrenador</strong><span>Gestiona clientes y conserva también tu espacio personal.</span></label>
      <label class="mode" [class.selected]="mode() === 'client'"><input type="radio" name="mode" value="client" [checked]="mode() === 'client'" (change)="mode.set('client')" />
        <app-icon name="training" /><strong>Cliente</strong><span>Un espacio personal para tus planes y tu progreso.</span></label>
    </div></fieldset>
    <p class="muted">Puedes cambiar de modo cuando quieras sin perder datos.</p>
    @if (mode(); as selectedMode) { <app-person-editor [personId]="workspace.settings()!.personalPersonId" [onboardingMode]="selectedMode" (saved)="finish()" /> }
    <p class="local-note"><app-icon name="shield" /> El modo adapta la navegación; no es un permiso de acceso.</p>
  </div>`, styles: `.onboarding { max-width: 48rem; margin: 1rem auto 3rem; } .mode { position: relative; display: grid; gap: .65rem; padding: 1.5rem; border: 2px solid var(--line); border-radius: var(--radius); background: white; cursor: pointer; } .mode.selected { border-color: var(--primary); background: var(--blue-soft); } .mode input { position: absolute; right: 1rem; top: 1.2rem; width: 1.2rem; height: 1.2rem; accent-color: var(--primary); } .mode strong { font-size: 1.2rem; } .mode span { font-weight: 400; color: var(--muted); } .mode app-icon { color: var(--primary); } .local-note { display: flex; gap: .6rem; color: var(--muted); font-size: .85rem; }` })
export class OnboardingPage {
  protected readonly workspace = inject(WorkspaceStore);
  private readonly router = inject(Router);
  protected readonly mode = signal<AppMode | null>(null);
  protected finish(): void { void this.router.navigateByUrl('/'); }
}
