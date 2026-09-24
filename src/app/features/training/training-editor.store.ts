import { Injectable, inject, signal } from '@angular/core';
import type { UUID } from '../../core/domain/identity';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { storageFailure } from '../../core/storage/database';
import { sessionErrors } from './training-domain';
import type { TrainingSession } from './training.model';
import { TrainingRepository, type TrainingDraft } from './training.repository';

/** One store per open session; it never follows the workspace's mutable active person. */
@Injectable()
export class TrainingEditorStore {
  private readonly repository = inject(TrainingRepository);
  private readonly coordinator = inject(DraftCoordinator);
  readonly value = signal<TrainingSession | null>(null);
  readonly saving = signal(false); readonly error = signal(''); readonly status = signal('');
  readonly errors = signal<string[]>([]); readonly conflict = signal(false);
  readonly remote = signal<TrainingSession | null>(null);
  private owner!: UUID; private draft!: TrainingDraft; private durable!: TrainingDraft;
  private queue: Promise<void> = Promise.resolve(); private commit?: Promise<boolean>;
  private dirty = false; private complete = false; private version = 0;
  async initialize(owner: UUID, id: UUID): Promise<void> {
    this.owner = owner;
    try {
      const draft = (await this.repository.listDrafts(owner)).find(item => item.payload.session.id === id);
      if (!draft) throw new Error('No se encontró el borrador de esta persona.');
      this.adopt(draft); this.status.set('Borrador recuperado. Las series pendientes no cuentan como realizadas.');
      if (JSON.stringify(await this.repository.get(owner, id)) !== JSON.stringify(draft.payload.baseSession)) await this.readConflict();
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
  private adopt(draft: TrainingDraft): void { this.draft = structuredClone(draft); this.durable = structuredClone(draft); this.value.set(structuredClone(draft.payload.session)); }
  change(session: TrainingSession): void {
    if (!this.value() || this.saving() || this.complete) return;
    this.value.set(structuredClone(session)); this.dirty = true; this.coordinator.pending.set(true); this.enqueue();
  }
  private enqueue(): void {
    if (this.conflict() || this.complete) return;
    const version = ++this.version;
    const draft: TrainingDraft = { ...this.draft, updatedAt: new Date().toISOString(), payload: { ...this.draft.payload, session: structuredClone(this.value()!) } };
    this.draft = draft; this.status.set('Guardando borrador…');
    this.queue = this.queue.then(async () => {
      if (this.conflict()) return;
      try {
        await this.repository.saveDraft(this.owner, draft, this.durable); this.durable = structuredClone(draft);
        if (version === this.version) { this.dirty = false; this.coordinator.pending.set(false); this.error.set(''); this.status.set('Borrador guardado. Sesión aún sin finalizar.'); }
      } catch (error) {
        this.dirty = true; this.error.set(storageFailure(error).message); this.status.set('Cambios sin guardar; tus valores siguen en el editor.');
        if (storageFailure(error).code === 'conflict') await this.readConflict();
      }
    });
  }
  private async readConflict(): Promise<void> {
    this.conflict.set(true);
    try {
      const draft = (await this.repository.listDrafts(this.owner)).find(item => item.editorKey === this.draft.editorKey);
      this.remote.set(draft?.payload.session ?? await this.repository.get(this.owner, this.value()!.id));
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
  private async persist(): Promise<boolean> {
    await this.queue;
    if (this.conflict()) return !this.dirty;
    if (this.dirty) { this.enqueue(); await this.queue; }
    return !this.dirty;
  }
  async flush(): Promise<boolean> { if (this.commit) await this.commit; return this.complete || !this.value() ? true : this.persist(); }
  async save(): Promise<boolean> {
    if (!this.value() || this.saving() || this.conflict() || this.complete) return false;
    this.errors.set(sessionErrors(this.value()!));
    if (this.errors().length) { this.error.set('Revisa las series pendientes o los valores indicados.'); return false; }
    this.saving.set(true); this.commit = this.commitValue();
    try { return await this.commit; } finally { this.commit = undefined; this.saving.set(false); }
  }
  private async commitValue(): Promise<boolean> {
    try {
      this.dirty = true; this.enqueue(); if (!await this.persist()) return false;
      await this.repository.save(this.owner, this.draft); this.complete = true; this.coordinator.pending.set(false); return true;
    } catch (error) { this.error.set(storageFailure(error).message); if (storageFailure(error).code === 'conflict') await this.readConflict(); return false; }
  }
  async recover(): Promise<void> {
    await this.queue;
    try {
      this.adopt(await this.repository.recover(this.owner, this.value()!.id));
      this.dirty = false; this.coordinator.pending.set(false); this.conflict.set(false); this.errors.set([]); this.error.set('');
      this.status.set('Versión durable recuperada. Revisa los valores antes de corregir.');
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
}
