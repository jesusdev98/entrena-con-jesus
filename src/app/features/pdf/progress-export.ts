import { Injectable, inject, signal } from '@angular/core';
import type { UUID } from '../../core/domain/identity';
import { Database } from '../../core/storage/database';
import type { Person } from '../people/person.model';
import { downloadPdf } from './pdf-export';

export function pdfFilename(kind: 'comidas' | 'nutricion' | 'entrenamiento', name: string, identity: string): string {
  const slug = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45) || 'registro';
  return `entrena-con-jesus-${kind}-${slug}-${identity.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36)}.pdf`;
}

@Injectable({ providedIn: 'root' })
export class ProgressExport {
  private readonly database = inject(Database);
  readonly busy = signal(false); readonly message = signal(''); readonly error = signal('');
  readonly ready = signal<{ blob: Blob; filename: string; owner: UUID; selection: string } | null>(null);
  private async active(owner: UUID): Promise<Person> {
    const db = await this.database.open();
    const settings = await db.get('settings', 'workspace'); const person = await db.get('people', owner);
    if (!person || person.archived || !settings?.mode || settings.activePersonId !== owner ||
      (settings.mode === 'client' && settings.personalPersonId !== owner)) throw new Error('La persona activa cambió. Vuelve a seleccionar el registro antes de descargar.');
    return structuredClone(person);
  }
  async run(owner: UUID, selection: string, current: () => boolean, filename: string, build: (person: Person) => Promise<Blob>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.ready.set(null); this.error.set(''); this.message.set('Preparando PDF con datos guardados…');
    try {
      const person = await this.active(owner);
      if (!current()) throw new Error('La selección cambió durante la preparación.');
      const blob = await build(person);
      await this.active(owner);
      if (!current()) throw new Error('La selección cambió durante la preparación.');
      this.ready.set({ blob, filename, owner, selection }); downloadPdf(blob, filename);
      this.message.set('PDF descargado.');
    } catch (error) { this.message.set(''); this.error.set(error instanceof Error ? error.message : 'No se pudo generar el PDF.'); }
    finally { this.busy.set(false); }
  }
  async share(owner: UUID, selection: string): Promise<void> {
    const pdf = this.ready(); if (!pdf || pdf.owner !== owner || pdf.selection !== selection || this.busy()) return;
    try {
      await this.active(owner);
      const file = new File([pdf.blob], pdf.filename, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) { await navigator.share({ files: [file], title: pdf.filename }); return; }
      const url = URL.createObjectURL(pdf.blob); const opened = window.open(url, '_blank');
      if (opened) opened.opener = null;
      if (!opened) downloadPdf(pdf.blob, pdf.filename);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { if ((error as Error).name !== 'AbortError') this.error.set('No se pudo abrir el PDF. Puedes descargarlo de nuevo.'); }
  }
}
