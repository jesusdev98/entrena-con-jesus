import { Injectable, inject, signal } from '@angular/core';
import { newId, type UUID } from '../../core/domain/identity';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { storageFailure } from '../../core/storage/database';
import type { RoutineContentDraft, RoutineRevision } from './routine.model';
import { duplicateContent, newWeek, routineErrors } from './routine-planning';
import { RoutinesRepository, type RoutineDraft } from './routines.repository';

/** One instance per editor, bound to the original person for its entire lifetime. */
@Injectable()
export class RoutineEditorStore {
  private readonly repository = inject(RoutinesRepository);
  private readonly coordinator = inject(DraftCoordinator);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly errors = signal<string[]>([]);
  readonly conflict = signal(false);
  readonly current = signal<RoutineRevision | null>(null);
  readonly otherDraft = signal<RoutineDraft | null>(null);
  readonly value = signal<RoutineDraft['payload']>({ kind: 'routine', planId: newId(), baseRevisionId: null, name: '', content: { weeks: [newWeek()], notes: '' } });
  private owner!: UUID;
  private draft!: RoutineDraft;
  private durable: RoutineDraft | null = null;
  private queue: Promise<void> = Promise.resolve();
  private commit?: Promise<boolean>;
  private dirty = false;
  private complete = false;
  private version = 0;

  async initialize(owner: UUID, editorKey: string, planId?: UUID): Promise<void> {
    this.owner = owner;
    this.loading.set(true); this.error.set('');
    try {
      const recovered = (await this.repository.listDrafts(owner)).find(draft => draft.editorKey === editorKey);
      const current = await this.repository.latest(owner, recovered?.payload.planId ?? planId ?? this.value().planId);
      if (planId && !current && !recovered) throw new Error('La rutina no está disponible.');
      const now = new Date().toISOString();
      this.draft = recovered ?? { id: newId(), personId: owner, editorKey, createdAt: now, updatedAt: now,
        payload: current ? { kind: 'routine', planId: current.planId, baseRevisionId: current.id, name: current.name, content: structuredClone(current.content) } : this.value() };
      this.durable = recovered ? structuredClone(recovered) : null;
      this.value.set(structuredClone(this.draft.payload));
      this.current.set(current ?? null);
      this.otherDraft.set(recovered ?? null);
      this.conflict.set((current?.id ?? null) !== this.value().baseRevisionId || !!current?.archived);
      this.status.set(recovered ? 'Borrador recuperado de esta persona. Aún no es una rutina guardada.' : 'Los cambios se guardan como borrador; la rutina requiere validación.');
      this.loading.set(false);
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
  change(name: string, content: RoutineContentDraft): void {
    if (this.loading() || this.saving() || this.complete) return;
    this.value.update(value => ({ ...value, name, content: structuredClone(content) }));
    this.dirty = true; this.coordinator.pending.set(true);
    if (this.errors().length) this.errors.set(routineErrors(name, content));
    this.enqueue();
  }
  private enqueue(): void {
    if (this.complete || this.conflict()) return;
    const version = ++this.version;
    const now = new Date().toISOString();
    const updatedAt = now <= this.draft.updatedAt ? new Date(Date.parse(this.draft.updatedAt) + 1).toISOString() : now;
    const draft: RoutineDraft = { ...this.draft, updatedAt, payload: structuredClone(this.value()) };
    this.draft = draft; this.status.set('Cambios sin guardar: guardando borrador…');
    this.queue = this.queue.then(async () => {
      if (this.conflict()) return;
      try {
        await this.repository.saveDraft(this.owner, draft, this.durable);
        this.durable = structuredClone(draft);
        if (version === this.version) { this.dirty = false; this.coordinator.pending.set(false); this.error.set(''); this.status.set('Borrador guardado en este dispositivo. Aún no es una rutina guardada.'); }
      } catch (error) {
        this.dirty = true; this.status.set('Cambios sin guardar. El editor conserva tus valores.');
        this.error.set(storageFailure(error).message);
        if (storageFailure(error).code === 'conflict') await this.readConflict();
      }
    });
  }
  private async readConflict(): Promise<void> {
    this.conflict.set(true);
    try {
      this.current.set(await this.repository.latest(this.owner, this.value().planId) ?? null);
      this.otherDraft.set((await this.repository.listDrafts(this.owner)).find(draft => draft.editorKey === this.draft.editorKey) ?? null);
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
  private async persist(): Promise<boolean> {
    await this.queue;
    if (this.conflict()) return !this.dirty;
    if (this.dirty) { this.enqueue(); await this.queue; }
    return !this.dirty;
  }
  async flush(): Promise<boolean> { if (this.commit) await this.commit; return this.loading() || this.complete ? true : this.persist(); }
  async save(): Promise<boolean> {
    if (this.loading() || this.saving() || this.conflict() || this.complete) return false;
    this.errors.set(routineErrors(this.value().name, this.value().content));
    if (this.errors().length) { this.error.set('La rutina está incompleta. Revisa los campos indicados; puedes conservar el borrador.'); return false; }
    this.saving.set(true);
    this.commit = this.commitValue();
    try { return await this.commit; } finally { this.commit = undefined; this.saving.set(false); }
  }
  private async commitValue(): Promise<boolean> {
    try {
      this.dirty = true; this.enqueue();
      if (!await this.persist()) return false;
      await this.repository.save(this.owner, this.draft);
      this.complete = true; this.coordinator.pending.set(false); return true;
    } catch (error) {
      this.error.set(storageFailure(error).message);
      if (storageFailure(error).code === 'conflict') await this.readConflict();
      return false;
    }
  }
  async resolve(choice: 'current' | 'mine' | 'other' | 'copy'): Promise<void> {
    if (this.saving()) return;
    await this.queue;
    try {
      // The displayed comparison is the expected base; a later change still fails CAS/commit.
      const current = this.current();
      if (choice === 'copy') {
        const planId = newId(); const now = new Date().toISOString();
        this.value.update(value => ({ ...value, planId, baseRevisionId: null, name: `${value.name} (copia)`.slice(0, 160), content: duplicateContent(value.content) }));
        this.draft = { id: newId(), personId: this.owner, editorKey: `routine:${planId}`, createdAt: now, updatedAt: now, payload: this.value() };
        this.durable = null;
      } else {
        if (choice !== 'other' && (!current || current.archived)) { this.error.set('La versión guardada no está disponible para editar. Guarda una copia o restaura la rutina desde la lista.'); return; }
        this.durable = this.otherDraft();
        if (choice === 'other') {
          if (!this.otherDraft()) return;
          this.value.set(structuredClone(this.otherDraft()!.payload));
        } else this.value.update(value => ({ ...value, baseRevisionId: current!.id, ...(choice === 'current' ? { name: current!.name, content: structuredClone(current!.content) } : {}) }));
        if (this.durable) this.draft = { ...this.durable, payload: this.value() };
      }
      this.conflict.set(false); this.error.set(''); this.errors.set([]);
      this.dirty = true; this.coordinator.pending.set(true); this.enqueue(); await this.queue;
      if (choice === 'other' && (current?.id ?? null) !== this.value().baseRevisionId) await this.readConflict();
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
}
