import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DraftCoordinator } from '../storage/draft-coordinator';

@Injectable({ providedIn: 'root' })
export class AppUpdates {
  private readonly updates = inject(SwUpdate);
  private readonly drafts = inject(DraftCoordinator);
  readonly ready = signal(false);
  readonly error = signal('');
  constructor() {
    this.updates.versionUpdates.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event.type === 'VERSION_READY') this.ready.set(true);
      if (event.type === 'VERSION_INSTALLATION_FAILED') this.error.set('La actualización no se descargó por completo. La versión actual sigue disponible.');
    });
    this.updates.unrecoverable.pipe(takeUntilDestroyed()).subscribe(() => this.error.set('La aplicación necesita recargarse. Guarda los borradores antes de hacerlo.'));
  }
  async check(): Promise<void> {
    try { if (this.updates.isEnabled) await this.updates.checkForUpdate(); }
    catch { this.error.set('No se pudo buscar una actualización. Inténtalo cuando tengas conexión.'); }
  }
  async apply(): Promise<void> {
    if (!await this.drafts.flush()) { this.error.set('No se actualizará hasta que se guarden los borradores pendientes.'); return; }
    window.location.reload();
  }
}
