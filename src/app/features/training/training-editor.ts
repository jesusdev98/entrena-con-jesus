import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, effect, inject, input, output, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { LocalDate, UUID } from '../../core/domain/identity';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { Button } from '../../shared/ui/button';
import { NumberField } from '../../shared/ui/number-field';
import { ExercisePosePair } from '../exercises/exercise-pose-pair';
import { prescriptionType } from '../routines/routine-planning';
import { TrainingEditorStore } from './training-editor.store';
import { ActualSetEditor } from './actual-set-editor';
import { SessionSummary } from './session-summary';
import type { ActualSet, SessionExercise } from './training.model';

@Component({ selector: 'app-training-editor', providers: [TrainingEditorStore], imports: [ReactiveFormsModule, Button, NumberField, ExercisePosePair, ActualSetEditor, SessionSummary],
  changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './training-editor.html' })
export class TrainingEditor implements OnInit {
  readonly personId = input.required<UUID>(); readonly sessionId = input.required<UUID>(); readonly saved = output<void>(); readonly closed = output<void>();
  readonly store = inject(TrainingEditorStore); private readonly coordinator = inject(DraftCoordinator); private readonly destroy = inject(DestroyRef);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading'); readonly type = prescriptionType;
  readonly form = new FormGroup({ date: new FormControl('', { nonNullable: true }), duration: new FormControl<number | null>(null), notes: new FormControl('', { nonNullable: true }) });
  constructor() {
    let focused = false;
    effect(() => { const heading = this.heading(); if (heading && !focused) { heading.nativeElement.focus(); focused = true; } });
    effect(() => { const value = this.store.value(); if (value) this.form.setValue({ date: value.date, duration: value.durationMinutes, notes: value.notes }, { emitEvent: false }); });
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
      const session = this.store.value(); const value = this.form.getRawValue();
      if (session) this.store.change({ ...session, date: value.date as LocalDate, durationMinutes: value.duration, notes: value.notes });
    });
  }
  async ngOnInit(): Promise<void> { this.destroy.onDestroy(this.coordinator.register(() => this.store.flush())); await this.store.initialize(this.personId(), this.sessionId()); }
  media(exercise: SessionExercise) { const media = exercise.exercise.media; return media && 'frames' in media ? media : null; }
  replace(exerciseId: UUID, set: ActualSet): void {
    const session = this.store.value()!;
    this.store.change({ ...session, exercises: session.exercises.map(exercise => exercise.id === exerciseId ? { ...exercise, sets: exercise.sets.map(item => item.id === set.id ? set : item) } : exercise) });
  }
  async save(): Promise<void> { if (await this.store.save()) this.saved.emit(); }
  async close(): Promise<void> { if (await this.store.flush()) this.closed.emit(); }
}
