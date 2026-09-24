import { Injectable, computed, inject, signal } from '@angular/core';
import type { LocalDate, UUID } from '../../core/domain/identity';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { storageFailure } from '../../core/storage/database';
import { calculateActivity, type ActivityDayValue, type DailyTargetSnapshot } from './daily-target.model';
import { DailyTargetRepository, same, type ActivityDraft } from './daily-target.repository';
import { parseMetCatalog, type MetCatalog } from './met-catalog';
import { TrainingRepository } from '../training/training.repository';
import type { TrainingSession } from '../training/training.model';

@Injectable()
export class ActivityEditorStore {
  private readonly repository = inject(DailyTargetRepository); private readonly training = inject(TrainingRepository);
  private readonly coordinator = inject(DraftCoordinator);
  readonly draft = signal<ActivityDraft | null>(null); readonly error = signal(''); readonly status = signal(''); readonly busy = signal(false);
  readonly conflict = signal(false); readonly remoteDraft = signal<ActivityDraft | null>(null); readonly remoteDay = signal<DailyTargetSnapshot | null>(null);
  readonly comparisonReady = signal(false);
  readonly sessions = signal<TrainingSession[]>([]);
  readonly calculation = computed(() => { const draft = this.draft(); if (!draft) return { value: null, error: '' };
    try { return { value: calculateActivity(draft.payload.value, draft.payload.context), error: '' }; } catch (error) { return { value: null, error: error instanceof Error ? error.message : 'Revisa los datos.' }; } });
  private durable!: ActivityDraft; private owner!: UUID; private catalog!: MetCatalog;
  private queue: Promise<void> = Promise.resolve(); private dirty = false; private version = 0; private commit?: Promise<void>;
  async initialize(owner: UUID, date: LocalDate): Promise<void> {
    this.owner = owner; this.busy.set(true);
    try {
      if (!this.catalog) { const response = await fetch(new URL('catalogs/activity-mets.json', document.baseURI)); if (!response.ok) throw new Error('No se pudo cargar el catálogo MET. Vuelve a intentar.'); this.catalog = parseMetCatalog(await response.json()); }
      this.adopt(await this.repository.open(owner, date, this.catalog));
      this.sessions.set((await this.training.list(owner)).filter(session => session.status === 'completed' && session.date === date));
      this.status.set('Borrador recuperado. El objetivo solo se publica al guardar el día.');
      if (!same(await this.repository.get(owner, date), this.durable.payload.base)) await this.readConflict();
    } catch (error) { this.error.set(error instanceof Error ? error.message : storageFailure(error).message); }
    finally { this.busy.set(false); }
  }
  private adopt(draft: ActivityDraft): void { this.durable = structuredClone(draft); this.draft.set(structuredClone(draft)); this.dirty = false; this.conflict.set(false); this.error.set(''); this.coordinator.pending.set(false); }
  change(value: ActivityDayValue): void {
    if (this.busy() || !this.draft()) return;
    this.draft.update(draft => ({ ...draft!, updatedAt: new Date().toISOString(), payload: { ...draft!.payload, value: structuredClone(value) } }));
    this.dirty = true; this.coordinator.pending.set(true); this.enqueue();
  }
  private enqueue(): void {
    if (this.conflict()) return;
    const next = structuredClone(this.draft()!); const version = ++this.version; this.status.set('Guardando borrador de actividad…');
    this.queue = this.queue.then(async () => {
      if (this.conflict()) return;
      try { await this.repository.saveDraft(this.owner, next, this.durable); this.durable = next;
        if (version === this.version) { this.dirty = false; this.coordinator.pending.set(false); this.error.set(''); this.status.set('Borrador de actividad guardado. Objetivo aún sin publicar.'); }
      } catch (error) { this.error.set(storageFailure(error).message); this.dirty = true; if (storageFailure(error).code === 'conflict') await this.readConflict(); }
    });
  }
  async flush(): Promise<boolean> { if (this.commit) await this.commit; await this.queue; if (this.dirty && !this.conflict()) { this.enqueue(); await this.queue; } return !this.dirty && !this.conflict() && !this.busy(); }
  async save(): Promise<void> {
    if (this.busy() || this.conflict() || !this.calculation().value) return;
    if (!await this.flush()) return;
    this.busy.set(true);
    this.commit = (async () => {
      try { await this.repository.save(this.owner, this.durable); this.adopt(await this.repository.open(this.owner, this.durable.payload.date, this.catalog)); this.status.set('Actividad y objetivo guardados en esta persona y fecha.'); }
      catch (error) { this.error.set(storageFailure(error).message); if (storageFailure(error).code === 'conflict') await this.readConflict(); }
    })();
    try { await this.commit; } finally { this.commit = undefined; this.busy.set(false); }
  }
  async refreshContext(): Promise<void> {
    if (this.busy() || this.conflict() || !await this.flush()) return;
    this.busy.set(true);
    try { this.adopt(await this.repository.refreshContext(this.owner, this.durable, this.catalog)); this.status.set('Contexto actualizado por confirmación. Revisa y guarda el día para publicar el nuevo objetivo.'); }
    catch (error) { this.error.set(storageFailure(error).message); if (storageFailure(error).code === 'conflict') await this.readConflict(); }
    finally { this.busy.set(false); }
  }
  async readConflict(): Promise<void> {
    this.conflict.set(true); this.comparisonReady.set(false); this.status.set('Tus cambios locales se conservan. Elige recuperar o seguir comparando.');
    try { const date = this.draft()!.payload.date; this.remoteDraft.set(await this.repository.draft(this.owner, date)); this.remoteDay.set(await this.repository.get(this.owner, date)); this.comparisonReady.set(true); }
    catch (error) { this.error.set(storageFailure(error).message); }
  }
  async recover(): Promise<void> {
    if (!this.comparisonReady() || this.busy()) return;
    this.busy.set(true);
    await this.queue;
    try { this.adopt(await this.repository.recover(this.owner, this.remoteDraft(), this.remoteDay(), this.draft()!.payload.date, this.catalog)); this.status.set('Versión durable recuperada. Revisa antes de guardar.'); }
    catch (error) { this.error.set(storageFailure(error).message); await this.readConflict(); }
    finally { this.busy.set(false); }
  }
}
