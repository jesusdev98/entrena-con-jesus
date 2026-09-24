import { Injectable, signal } from '@angular/core';
import { parseExerciseCatalog, type CatalogExercise } from './exercise-catalog.model';

@Injectable({ providedIn: 'root' })
export class ExerciseCatalogStore {
  readonly exercises = signal<CatalogExercise[]>([]);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly error = signal('');
  async load(): Promise<void> {
    if (this.status() === 'loading' || this.status() === 'ready') return;
    this.status.set('loading'); this.error.set('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(new URL('catalogs/exercises.es.json', document.baseURI), { signal: controller.signal });
      if (!response.ok) throw new Error(`Exercise catalog HTTP ${response.status}`);
      this.exercises.set(parseExerciseCatalog(await response.json())); this.status.set('ready');
    } catch {
      this.exercises.set([]); this.status.set('error');
      this.error.set('No se pudo cargar o validar el catálogo local. Si es la primera visita, completa la descarga con conexión desde Ajustes y vuelve a intentarlo.');
    } finally { clearTimeout(timeout); }
  }
}
