import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, type ValidatorFn } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { newId, type UUID } from '../../core/domain/identity';
import { storageFailure } from '../../core/storage/database';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { DraftsRepository } from '../../core/storage/drafts.repository';
import type { Draft } from '../../core/storage/draft.model';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import type { CustomExercise, CustomExerciseFormValue, ExerciseCategory, LoggingType } from './exercise.model';
import { categoryLabels, customLoggingLabels, customLoggingType, loggingLabels } from './exercise-catalog.model';
import { CustomExercisesRepository } from './custom-exercises.repository';

const requiredName: ValidatorFn = control => typeof control.value === 'string' && control.value.trim() ? null : { required: true };
@Component({ selector: 'app-custom-exercise-editor', imports: [ReactiveFormsModule, Button, Card],
  changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './custom-exercise-editor.html' })
export class CustomExerciseEditor implements OnInit {
  readonly personId = input.required<UUID>();
  readonly exerciseId = input<UUID>();
  readonly saved = output<void>();
  readonly closed = output<void>();
  private readonly repository = inject(CustomExercisesRepository);
  private readonly drafts = inject(DraftsRepository);
  private readonly coordinator = inject(DraftCoordinator);
  private readonly destroy = inject(DestroyRef);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  protected readonly categories = Object.entries(categoryLabels).map(([key, label]) => ({ key, label }));
  protected readonly loggingTypes = Object.entries(customLoggingLabels).map(([key, label]) => ({ key, label }));
  protected readonly categoryLabels = categoryLabels;
  protected readonly loggingLabels = loggingLabels;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly draftStatus = signal('');
  readonly conflict = signal(false);
  readonly currentExercise = signal<CustomExercise | null>(null);
  private owner!: UUID;
  private identity = newId();
  private baseUpdatedAt: string | null = null;
  private draft?: Draft;
  private dirty = false;
  private complete = false;
  private version = 0;
  private queue: Promise<void> = Promise.resolve();
  private commit?: Promise<void>;
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [requiredName, Validators.maxLength(160)] }),
    category: new FormControl<ExerciseCategory | ''>('', { nonNullable: true, validators: [Validators.required] }),
    loggingType: new FormControl<LoggingType | ''>('', { nonNullable: true, validators: [Validators.required] }),
    instruction: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
    equipment: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });
  constructor() {
    let focused = false;
    effect(() => { const element = this.nameInput(); if (element && !focused) { element.nativeElement.focus(); focused = true; } });
  }
  async ngOnInit(): Promise<void> {
    // Capture ownership once; the page recreates this editor when person or mode changes.
    this.owner = this.personId();
    this.destroy.onDestroy(this.coordinator.register(() => this.flush()));
    await this.initialize();
  }
  async initialize(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const existing = this.exerciseId() ? await this.repository.get(this.owner, this.exerciseId()!) : undefined;
      if (this.exerciseId() && (!existing || existing.archived)) throw new Error('Unavailable exercise');
      this.identity = existing?.id ?? this.identity;
      this.baseUpdatedAt = existing?.updatedAt ?? null;
      if (existing) this.setExercise(existing);
      const editorKey = this.exerciseId() ? `custom-exercise:${this.exerciseId()}` : 'custom-exercise:new';
      this.draft = await this.drafts.find(this.owner, editorKey);
      if (this.draft) {
        if (this.draft.payload.kind !== 'custom-exercise' || (this.exerciseId() && this.draft.payload.exerciseId !== this.exerciseId())) throw new Error('Invalid draft');
        this.identity = this.draft.payload.exerciseId;
        this.baseUpdatedAt = this.draft.payload.baseUpdatedAt;
        this.form.setValue({ ...this.draft.payload.value, equipment: this.draft.payload.value.equipment ?? '',
          loggingType: customLoggingType(this.draft.payload.value.loggingType) as LoggingType | '' }, { emitEvent: false });
        this.conflict.set((existing?.updatedAt ?? null) !== this.baseUpdatedAt);
        this.currentExercise.set(existing ?? null);
        this.draftStatus.set('Borrador recuperado de esta persona.');
      } else {
        const now = new Date().toISOString();
        this.draft = { id: newId(), personId: this.owner, editorKey, createdAt: now, updatedAt: now,
          payload: { kind: 'custom-exercise', exerciseId: this.identity, baseUpdatedAt: this.baseUpdatedAt, value: this.form.getRawValue() } };
      }
      this.form.valueChanges.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => { this.dirty = true; this.coordinator.pending.set(true); this.enqueue(); });
      this.loading.set(false);
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
  private setExercise(exercise: CustomExercise): void {
    this.form.setValue({ name: exercise.name, category: exercise.category, loggingType: customLoggingType(exercise.loggingType) as LoggingType,
      instruction: exercise.instruction, notes: exercise.notes ?? '', equipment: exercise.equipment?.join(', ') ?? '' }, { emitEvent: false });
  }
  private enqueue(): void {
    if (!this.draft || this.complete) return;
    const version = ++this.version;
    const now = new Date().toISOString();
    const updatedAt = now <= this.draft.updatedAt ? new Date(Date.parse(this.draft.updatedAt) + 1).toISOString() : now;
    const draft: Draft = { ...this.draft, updatedAt, payload: { kind: 'custom-exercise', exerciseId: this.identity, baseUpdatedAt: this.baseUpdatedAt, value: this.form.getRawValue() } };
    this.draft = draft;
    this.draftStatus.set('Guardando borrador…');
    this.queue = this.queue.then(async () => {
      try {
        await this.drafts.save(this.owner, draft);
        if (version === this.version) { this.dirty = false; this.coordinator.pending.set(false); this.draftStatus.set('Borrador guardado en este dispositivo.'); this.error.set(''); }
      } catch (error) { this.dirty = true; this.draftStatus.set('Borrador pendiente de guardar.'); this.error.set(storageFailure(error).message); }
    });
  }
  private async persist(): Promise<boolean> {
    await this.queue;
    if (this.dirty) { this.enqueue(); await this.queue; }
    return !this.dirty;
  }
  async flush(): Promise<boolean> {
    if (this.commit) await this.commit;
    return this.loading() ? true : this.persist();
  }
  async close(): Promise<void> { if (await this.flush()) this.closed.emit(); }
  async save(): Promise<void> {
    if (this.loading() || this.saving() || this.conflict() || this.complete) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.error.set('Revisa el nombre, la categoría, el tipo de registro y la longitud de los textos.'); return; }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.form.disable({ emitEvent: false });
    this.commit = this.commitValue(value);
    await this.commit;
    this.commit = undefined;
  }
  private async commitValue(value: CustomExerciseFormValue): Promise<void> {
    try {
      this.dirty = true;
      this.enqueue();
      if (!await this.persist()) return;
      await this.repository.save(this.owner, this.identity, value, this.baseUpdatedAt, this.draft!);
      this.complete = true;
      this.saved.emit();
    } catch (error) {
      const failure = storageFailure(error);
      this.error.set(failure.message);
      if (failure.code === 'conflict') {
        this.conflict.set(true);
        try { this.currentExercise.set(await this.repository.get(this.owner, this.identity) ?? null); } catch { /* Retain draft when reading fails. */ }
      }
    } finally { this.saving.set(false); this.form.enable({ emitEvent: false }); }
  }
  async resolveConflict(keepDraft: boolean): Promise<void> {
    try {
      await this.queue;
      const current = await this.repository.get(this.owner, this.identity);
      if (!current || current.archived) { this.error.set('El ejercicio no está disponible para editar. Cierra el formulario y revisa los archivados. El borrador se conserva.'); return; }
      this.currentExercise.set(current);
      this.baseUpdatedAt = current.updatedAt;
      if (!keepDraft) this.setExercise(current);
      this.conflict.set(false);
      this.dirty = true;
      this.enqueue();
      await this.persist();
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
}
