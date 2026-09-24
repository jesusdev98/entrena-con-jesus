import { Injectable, signal } from '@angular/core';
import { parseFoodCatalog, type CatalogFood } from './food.model';

@Injectable({ providedIn: 'root' })
export class FoodCatalogStore {
  readonly foods = signal<CatalogFood[]>([]);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly error = signal('');
  async load(): Promise<void> {
    if (this.status() === 'loading' || this.status() === 'ready') return;
    this.status.set('loading');
    this.error.set('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(new URL('catalogs/foods.es.json', document.baseURI), { signal: controller.signal });
      if (!response.ok) throw new Error(`Food catalog HTTP ${response.status}`);
      this.foods.set(parseFoodCatalog(await response.json()));
      this.status.set('ready');
    } catch {
      this.foods.set([]);
      this.error.set('No se pudo cargar o validar el catálogo local. Si es la primera visita, completa la descarga con conexión desde Ajustes y vuelve a intentarlo.');
      this.status.set('error');
    } finally { clearTimeout(timeout); }
  }
}
