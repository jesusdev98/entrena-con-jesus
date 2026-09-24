import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, type ValidatorFn } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { newId, type UUID } from '../../../core/domain/identity';
import { storageFailure } from '../../../core/storage/database';
import { DraftCoordinator } from '../../../core/storage/draft-coordinator';
import { DraftsRepository } from '../../../core/storage/drafts.repository';
import type { Draft } from '../../../core/storage/draft.model';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { NumberField } from '../../../shared/ui/number-field';
import type { CustomFood, CustomFoodFormValue } from '../nutrition.model';
import { CustomFoodsRepository } from './custom-foods.repository';

const finiteAmount: ValidatorFn = control => typeof control.value === 'number' && Number.isFinite(control.value) && control.value >= 0 ? null : { amount: true };
const requiredName: ValidatorFn = control => typeof control.value === 'string' && control.value.trim() ? null : { required: true };
@Component({ selector: 'app-custom-food-editor', imports: [ReactiveFormsModule, Button, Card, NumberField],
  changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './custom-food-editor.html' })
export class CustomFoodEditor implements OnInit {
  readonly personId = input.required<UUID>();
  readonly foodId = input<UUID>();
  readonly saved = output<void>();
  readonly closed = output<void>();
  private readonly repository = inject(CustomFoodsRepository);
  private readonly drafts = inject(DraftsRepository);
  private readonly coordinator = inject(DraftCoordinator);
  private readonly destroy = inject(DestroyRef);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly draftStatus = signal('');
  readonly conflict = signal(false);
  readonly currentFood = signal<CustomFood | null>(null);
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
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    kcal: new FormControl<number | null>(null, finiteAmount), protein: new FormControl<number | null>(null, finiteAmount),
    carbohydrate: new FormControl<number | null>(null, finiteAmount), fat: new FormControl<number | null>(null, finiteAmount),
  });
  constructor() {
    let focused = false;
    effect(() => { const element = this.nameInput(); if (element && !focused) { element.nativeElement.focus(); focused = true; } });
  }
  async ngOnInit(): Promise<void> {
    // Capture identity once. The page recreates this editor for each workspace context.
    this.owner = this.personId();
    this.destroy.onDestroy(this.coordinator.register(() => this.flush()));
    await this.initialize();
  }
  async initialize(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const existing = this.foodId() ? await this.repository.get(this.owner, this.foodId()!) : undefined;
      if (this.foodId() && (!existing || existing.archived)) throw new Error('Unavailable food');
      this.identity = existing?.id ?? this.identity;
      this.baseUpdatedAt = existing?.updatedAt ?? null;
      if (existing) this.setFood(existing);
      const editorKey = this.foodId() ? `custom-food:${this.foodId()}` : 'custom-food:new';
      this.draft = await this.drafts.find(this.owner, editorKey);
      if (this.draft) {
        if (this.draft.payload.kind !== 'custom-food' || (this.foodId() && this.draft.payload.foodId !== this.foodId())) throw new Error('Invalid draft');
        this.identity = this.draft.payload.foodId;
        this.baseUpdatedAt = this.draft.payload.baseUpdatedAt;
        this.form.setValue(this.draft.payload.value, { emitEvent: false });
        this.conflict.set((existing?.updatedAt ?? null) !== this.baseUpdatedAt);
        this.currentFood.set(existing ?? null);
        this.draftStatus.set('Borrador recuperado de esta persona.');
      } else {
        const now = new Date().toISOString();
        this.draft = { id: newId(), personId: this.owner, editorKey, createdAt: now, updatedAt: now,
          payload: { kind: 'custom-food', foodId: this.identity, baseUpdatedAt: this.baseUpdatedAt, value: this.form.getRawValue() } };
      }
      this.form.valueChanges.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => { this.dirty = true; this.coordinator.pending.set(true); this.enqueue(); });
      this.loading.set(false);
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
  private setFood(food: CustomFood): void { this.form.setValue({ name: food.name, note: food.source?.note ?? '', ...food.per100g }, { emitEvent: false }); }
  private enqueue(): void {
    if (!this.draft || this.complete) return;
    const version = ++this.version;
    const now = new Date().toISOString();
    const updatedAt = now <= this.draft.updatedAt ? new Date(Date.parse(this.draft.updatedAt) + 1).toISOString() : now;
    const draft: Draft = { ...this.draft, updatedAt, payload: { kind: 'custom-food', foodId: this.identity, baseUpdatedAt: this.baseUpdatedAt, value: this.form.getRawValue() } };
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
    if (this.form.invalid) { this.error.set('Revisa el nombre y los cuatro valores por 100 g. No dejes cantidades vacías.'); return; }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.form.disable({ emitEvent: false });
    this.commit = this.commitValue(value);
    await this.commit;
    this.commit = undefined;
  }
  private async commitValue(value: CustomFoodFormValue): Promise<void> {
    try {
      // A new, untouched form must also have a durable draft before the atomic commit.
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
        try { this.currentFood.set(await this.repository.get(this.owner, this.identity) ?? null); } catch { /* Retain draft when reading fails. */ }
      }
    } finally { this.saving.set(false); this.form.enable({ emitEvent: false }); }
  }
  async resolveConflict(keepDraft: boolean): Promise<void> {
    try {
      await this.queue;
      const current = await this.repository.get(this.owner, this.identity);
      if (!current || current.archived) { this.error.set('El alimento no está disponible para editar. Cierra el formulario y revisa los archivados. El borrador se conserva.'); return; }
      this.currentFood.set(current);
      this.baseUpdatedAt = current.updatedAt;
      if (!keepDraft) this.setFood(current);
      this.conflict.set(false);
      this.dirty = true;
      this.enqueue();
      await this.persist();
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
}
