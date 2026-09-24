import { Injectable, inject, signal } from '@angular/core';
import { newId, type UUID } from '../../../core/domain/identity';
import { DraftCoordinator } from '../../../core/storage/draft-coordinator';
import { storageFailure } from '../../../core/storage/database';
import { duplicateContent, newWeek, planErrors, type MealPlanContentDraft } from './meal-planning';
import { MealPlansRepository, type MealPlanDraft } from './meal-plans.repository';
import type { MealPlanRevision } from '../nutrition.model';

@Injectable()
export class MealEditorStore {
  private readonly repo = inject(MealPlansRepository);
  private readonly coordinator = inject(DraftCoordinator);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly errors = signal<string[]>([]);
  readonly conflict = signal(false);
  readonly current = signal<MealPlanRevision | null>(null);
  readonly otherDraft = signal<MealPlanDraft | null>(null);
  readonly value = signal<MealPlanDraft['payload']>({ kind: 'meal-plan', planId: newId(), baseRevisionId: null, name: '', content: { weeks: [newWeek()], notes: '' } });
  private owner!: UUID;
  private draft!: MealPlanDraft;
  private durable: MealPlanDraft | null = null;
  private queue: Promise<void> = Promise.resolve();
  private commit?: Promise<boolean>;
  private dirty = false;
  private complete = false;
  private version = 0;

  async initialize(owner: UUID, key: string, planId?: UUID): Promise<void> {
    this.owner = owner; this.loading.set(true); this.error.set('');
    try {
      const recovered = (await this.repo.listDrafts(owner)).find(item => item.editorKey === key);
      const current = await this.repo.latest(owner, recovered?.payload.planId ?? planId ?? this.value().planId);
      if (planId && !current && !recovered) throw new Error('El plan no está disponible.');
      const now = new Date().toISOString();
      this.draft = recovered ?? { id: newId(), personId: owner, editorKey: key, createdAt: now, updatedAt: now,
        payload: current ? { kind: 'meal-plan', planId: current.planId, baseRevisionId: current.id, name: current.name, content: structuredClone(current.content) } : this.value() };
      this.durable = recovered ? structuredClone(recovered) : null;
      this.value.set(structuredClone(this.draft.payload));
      this.current.set(current ?? null); this.otherDraft.set(recovered ? structuredClone(recovered) : null);
      this.conflict.set((current?.id ?? null) !== this.value().baseRevisionId || !!current?.archived);
      this.status.set(recovered ? 'Borrador recuperado. Todavía no es un plan guardado.' : 'Los cambios se conservan como borrador hasta guardar el plan.');
    } catch (error) { this.error.set(storageFailure(error).message); }
    finally { this.loading.set(false); }
  }
  change(name: string, content: MealPlanContentDraft): void {
    if (this.loading() || this.saving() || this.complete) return;
    this.value.update(value => ({ ...value, name, content: structuredClone(content) }));
    this.dirty = true; this.coordinator.pending.set(true);
    if (this.errors().length) this.errors.set(planErrors(name, content));
    this.enqueue();
  }
  private enqueue(): void {
    if (this.complete || this.conflict()) return;
    const version = ++this.version;
    const now = new Date().toISOString();
    const updatedAt = now <= this.draft.updatedAt ? new Date(Date.parse(this.draft.updatedAt) + 1).toISOString() : now;
    const draft: MealPlanDraft = { ...this.draft, updatedAt, payload: structuredClone(this.value()) };
    this.draft = draft; this.status.set('Guardando borrador…');
    this.queue = this.queue.then(async () => {
      if (this.conflict()) return;
      try {
        await this.repo.saveDraft(this.owner, draft, this.durable);
        this.durable = structuredClone(draft);
        if (version === this.version) { this.dirty = false; this.coordinator.pending.set(false); this.error.set(''); this.status.set('Borrador guardado en este dispositivo.'); }
      } catch (error) {
        this.dirty = true; this.coordinator.pending.set(true);
        this.error.set(storageFailure(error).message); this.status.set('Cambios sin guardar; conserva el editor abierto.');
        if (storageFailure(error).code === 'conflict') await this.readConflict();
      }
    });
  }
  private async readConflict(): Promise<void> {
    this.conflict.set(true);
    try {
      this.current.set(await this.repo.latest(this.owner, this.value().planId) ?? null);
      this.otherDraft.set((await this.repo.listDrafts(this.owner)).find(item => item.editorKey === this.draft.editorKey) ?? null);
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
  async flush(): Promise<boolean> {
    await this.queue;
    if (this.commit) await this.commit;
    if (this.loading() || this.complete) return true;
    if (this.dirty && !this.conflict()) { this.enqueue(); await this.queue; }
    return !this.dirty;
  }
  async save(): Promise<boolean> {
    if (this.loading() || this.saving() || this.complete || this.conflict()) return false;
    this.errors.set(planErrors(this.value().name, this.value().content));
    if (this.errors().length) { this.error.set('El plan está incompleto. Corrige los campos; tu borrador permanece disponible.'); return false; }
    this.saving.set(true);
    this.commit = this.commitValue();
    try { return await this.commit; } finally { this.commit = undefined; this.saving.set(false); }
  }
  private async commitValue(): Promise<boolean> {
    try {
      this.dirty = true; this.enqueue();
      await this.queue;
      if (this.dirty && !this.conflict()) { this.enqueue(); await this.queue; }
      if (this.dirty) return false;
      await this.repo.save(this.owner, this.draft);
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
    const current = this.current();
    try {
    if (choice === 'copy') {
      const id = newId(); const now = new Date().toISOString();
      this.value.update(value => ({ ...value, planId: id, baseRevisionId: null, name: `${value.name} (copia)`.slice(0, 160), content: duplicateContent(value.content) }));
      this.draft = { id: newId(), personId: this.owner, editorKey: `meal-plan:${id}`, createdAt: now, updatedAt: now, payload: this.value() };
      this.durable = null;
    } else {
      if (choice !== 'other' && (!current || current.archived)) { this.error.set('Restaura el plan o guarda una copia antes de editar.'); return; }
      this.durable = this.otherDraft() ? structuredClone(this.otherDraft()!) : null;
      if (choice === 'other') {
        if (!this.durable) { this.error.set('El otro borrador ya no existe.'); return; }
        this.value.set(structuredClone(this.durable.payload));
      } else this.value.update(value => ({ ...value, baseRevisionId: current!.id,
        ...(choice === 'current' ? { name: current!.name, content: structuredClone(current!.content) } : {}) }));
      if (this.durable) this.draft = { ...this.durable, payload: structuredClone(this.value()) };
    }
    this.conflict.set(false); this.error.set(''); this.errors.set([]);
    this.dirty = true; this.coordinator.pending.set(true); this.enqueue(); await this.queue;
    if (choice === 'other' && (current?.id ?? null) !== this.value().baseRevisionId) await this.readConflict();
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
}
