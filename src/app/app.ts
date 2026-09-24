import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Shell } from './shared/ui/shell';
import { WorkspaceStore } from './features/people/workspace.store';
import { Database } from './core/storage/database';
import { DraftCoordinator } from './core/storage/draft-coordinator';
import { Button } from './shared/ui/button';

@Component({ selector: 'app-root', imports: [RouterOutlet, Shell, Button], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-shell>
    @if (database.status() === 'blocked') { <p class="error" role="alert">Otra pestaña impide actualizar la base de datos. Ciérrala para continuar; tus datos se conservarán.</p> }
    @if (database.status() === 'closed') { <p class="error" role="alert">La conexión local se cerró. Guarda el borrador de nuevo antes de continuar.</p> }
    @if (workspace.error()) { <div class="error" role="alert"><p>{{ workspace.error() }}</p><button appButton variant="secondary" (click)="retry()" [disabled]="workspace.busy()">Reintentar conexión</button></div> }
    @if (workspace.ready()) { <router-outlet /> } @else if (!workspace.error()) { <p role="status">Preparando tu espacio local…</p> }
  </app-shell>` })
export class App {
  protected readonly workspace = inject(WorkspaceStore);
  protected readonly database = inject(Database);
  private readonly router = inject(Router);
  protected async retry(): Promise<void> {
    await this.workspace.initialize();
    if (this.workspace.ready() && !this.workspace.error()) await this.router.navigateByUrl('/');
  }
  constructor() {
    const drafts = inject(DraftCoordinator);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (drafts.pending()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', beforeUnload));
  }
}
