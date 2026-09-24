import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { newId, type UUID } from '../../core/domain/identity';
import { storageFailure } from '../../core/storage/database';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { DraftsRepository } from '../../core/storage/drafts.repository';
import type { Draft } from '../../core/storage/draft.model';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { NumberField } from '../../shared/ui/number-field';
import { PeopleRepository } from './people.repository';
import { WorkspaceStore } from './workspace.store';
import { emptyProfile, type AppMode, type Person, type PersonFormValue, type PersonProfile } from './person.model';
import { validatePerson } from './person.validation';

@Component({ selector: 'app-person-editor', imports: [ReactiveFormsModule, Button, Card, NumberField],
  changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './person-editor.html' })
export class PersonEditor implements OnInit {
  readonly personId = input<UUID>();
  readonly onboardingMode = input<AppMode>();
  readonly saved = output<UUID>();
  private readonly workspace = inject(WorkspaceStore);
  private readonly repository = inject(PeopleRepository);
  private readonly drafts = inject(DraftsRepository);
  private readonly coordinator = inject(DraftCoordinator);
  private readonly destroy = inject(DestroyRef);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly draftStatus = signal('');
  readonly identity = signal<UUID | null>(null);
  readonly conflict = signal(false);
  readonly currentProfile = signal<Person | null>(null);
  private draft?: Draft;
  private baseUpdatedAt: string | null = null;
  private profile = emptyProfile();
  private queue: Promise<void> = Promise.resolve();
  private dirty = false;
  private complete = false;
  private version = 0;
  private subjectId = newId();

  readonly form = new FormGroup({
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    reference: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    age: new FormControl<number | null>(null, [Validators.min(1), Validators.max(120), Validators.pattern(/^\d+$/)]),
    formulaSex: new FormControl<PersonProfile['formulaSex']>(null),
    heightCm: new FormControl<number | null>(null, [Validators.min(30), Validators.max(280)]),
    weightKg: new FormControl<number | null>(null, [Validators.min(1), Validators.max(600)]),
  });

  async ngOnInit(): Promise<void> {
    const unregister = this.coordinator.register(() => this.flush());
    this.destroy.onDestroy(unregister);
    try {
      const owner = this.personId() ?? this.workspace.settings()!.personalPersonId;
      const editorKey = this.personId() ? `person:${this.personId()}` : 'person:new';
      const existing = this.workspace.people().find(person => person.id === this.personId());
      this.subjectId = existing?.id ?? this.subjectId;
      this.baseUpdatedAt = existing?.updatedAt ?? null;
      if (existing) this.setValue(existing);
      this.draft = await this.drafts.find(owner, editorKey);
      if (this.draft?.payload.kind === 'person') {
        this.subjectId = this.draft.payload.subjectId;
        this.baseUpdatedAt = this.draft.payload.baseUpdatedAt;
        this.setValue(this.draft.payload.value);
        this.conflict.set((existing?.updatedAt ?? null) !== this.baseUpdatedAt);
        if (this.conflict()) this.currentProfile.set(existing ?? null);
        this.draftStatus.set('Borrador recuperado de este dispositivo.');
      } else {
        const now = new Date().toISOString();
        this.draft = { id: newId(), personId: owner, editorKey, createdAt: now, updatedAt: now,
          payload: { kind: 'person', subjectId: this.subjectId, value: this.value(), baseUpdatedAt: this.baseUpdatedAt } };
      }
      this.identity.set(this.subjectId);
      this.form.valueChanges.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
        this.dirty = true;
        this.coordinator.pending.set(true);
        this.enqueueDraft();
      });
      this.loading.set(false);
    } catch (error) { this.error.set(storageFailure(error).message); }
  }

  private setValue(value: PersonFormValue): void {
    this.profile = value.profile;
    this.form.patchValue({ displayName: value.displayName, reference: value.reference, age: value.profile.age,
      formulaSex: value.profile.formulaSex, heightCm: value.profile.heightCm, weightKg: value.profile.weightKg }, { emitEvent: false });
  }
  private value(): PersonFormValue {
    const value = this.form.getRawValue();
    return { displayName: value.displayName, reference: value.reference, profile: { ...this.profile,
      age: value.age, formulaSex: value.formulaSex, heightCm: value.heightCm, weightKg: value.weightKg } };
  }
  private enqueueDraft(): void {
    if (!this.draft || this.complete) return;
    const version = ++this.version;
    const draft: Draft = { ...this.draft, updatedAt: new Date().toISOString(),
      payload: { kind: 'person', subjectId: this.subjectId, value: this.value(), baseUpdatedAt: this.baseUpdatedAt } };
    this.draftStatus.set('Guardando borrador…');
    this.queue = this.queue.then(async () => {
      try {
        await this.drafts.save(draft.personId, draft);
        if (version === this.version) {
          this.dirty = false;
          this.coordinator.pending.set(false);
          this.draftStatus.set('Borrador guardado en este dispositivo.');
          this.error.set('');
        }
      } catch (error) {
        this.dirty = true;
        this.draftStatus.set('Borrador pendiente de guardar.');
        this.error.set(storageFailure(error).message);
      }
    });
  }
  async flush(): Promise<boolean> {
    await this.queue;
    if (this.dirty) { this.enqueueDraft(); await this.queue; }
    return !this.dirty;
  }
  async resolveConflict(keepDraft: boolean): Promise<void> {
    try {
      await this.queue;
      const current = this.currentProfile();
      if (!current) return;
      this.baseUpdatedAt = current.updatedAt;
      this.profile = current.profile;
      if (!keepDraft) this.setValue(current);
      this.conflict.set(false);
      this.dirty = true;
      this.coordinator.pending.set(true);
      this.enqueueDraft();
      await this.flush();
    } catch (error) { this.error.set(storageFailure(error).message); }
  }
  async save(): Promise<void> {
    if (this.loading() || this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.error.set('Revisa los campos indicados antes de guardar.'); return; }
    this.saving.set(true);
    this.error.set('');
    try {
      const value = validatePerson(this.value());
      if (!await this.flush()) return;
      await this.repository.savePerson(this.subjectId, value, this.baseUpdatedAt, this.draft, this.onboardingMode());
      this.complete = true;
      this.dirty = false;
      await this.workspace.refresh();
      this.saved.emit(this.subjectId);
    } catch (error) {
      const failure = storageFailure(error);
      this.error.set(failure.message);
      if (failure.code === 'conflict') {
        this.conflict.set(true);
        try {
          await this.workspace.refresh();
          this.currentProfile.set(this.workspace.people().find(person => person.id === this.subjectId) ?? null);
        } catch { /* The draft remains visible if the latest version cannot be read. */ }
      }
    }
    finally { this.saving.set(false); }
  }
}
