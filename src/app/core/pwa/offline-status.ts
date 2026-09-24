import { DestroyRef, Injectable, inject, isDevMode, signal } from '@angular/core';
import { abortable, waitForOfflineCache } from './cache-readiness';

export type OfflineState = 'development' | 'unsupported' | 'preparing' | 'ready' | 'incomplete';
@Injectable({ providedIn: 'root' })
export class OfflineStatus {
  readonly online = signal(navigator.onLine);
  readonly state = signal<OfflineState>(isDevMode() ? 'development' : 'preparing');
  readonly persistent = signal<boolean | null>(null);
  readonly persistenceMessage = signal('');
  private verification?: Promise<void>;
  private verificationController?: AbortController;
  constructor() {
    const online = () => this.online.set(navigator.onLine);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
      this.verificationController?.abort();
    });
    if (!isDevMode()) void this.verify();
  }
  verify(): Promise<void> {
    this.verification ??= this.prepare().finally(() => { this.verification = undefined; });
    return this.verification;
  }
  private async prepare(): Promise<void> {
    if (isDevMode()) return;
    if (!('serviceWorker' in navigator) || !('caches' in window)) { this.state.set('unsupported'); return; }
    this.state.set('preparing');
    const controller = new AbortController();
    this.verificationController = controller;
    const timeout = setTimeout(() => controller.abort(new Error('Offline preparation incomplete')), 15000);
    try {
      const registration = await abortable(navigator.serviceWorker.ready, controller.signal);
      if (!registration.active) throw new Error('Worker not active');
      const response = await fetch(new URL('resource-manifest.json', document.baseURI), { signal: controller.signal });
      if (!response.ok) throw new Error('Resource manifest unavailable');
      const manifest: { resources: string[] } = await response.json();
      if (!Array.isArray(manifest.resources) || manifest.resources.length === 0 || manifest.resources.some(path => typeof path !== 'string')) {
        throw new Error('Invalid resource manifest');
      }
      const resources = [...manifest.resources, 'resource-manifest.json'].map(path => new URL(path, document.baseURI));
      await waitForOfflineCache(resources, caches,
        () => registration.active?.state === 'activated' && navigator.serviceWorker.controller !== null,
        controller.signal);
      this.state.set('ready');
    } catch { this.state.set('incomplete'); }
    finally { clearTimeout(timeout); this.verificationController = undefined; }
  }
  async requestPersistence(): Promise<void> {
    try {
      if (!navigator.storage?.persist) { this.persistenceMessage.set('Este navegador no permite solicitar almacenamiento persistente.'); return; }
      const result = await navigator.storage.persist();
      this.persistent.set(result);
      this.persistenceMessage.set(result ? 'El navegador concedió almacenamiento persistente. Aun así, puedes borrarlo desde sus ajustes.' : 'El navegador no concedió la solicitud. Los datos siguen guardados, pero podrían eliminarse por falta de espacio.');
    } catch { this.persistenceMessage.set('No se pudo completar la solicitud. Tus datos actuales se conservan.'); }
  }
}
