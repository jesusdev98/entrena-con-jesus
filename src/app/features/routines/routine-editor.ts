import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, effect, inject, input, output, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { DraftCoordinator } from '../../core/storage/draft-coordinator';
import { storageFailure } from '../../core/storage/database';
import type { UUID } from '../../core/domain/identity';
import { Button } from '../../shared/ui/button';
import { ExerciseCatalogStore } from '../exercises/exercise-catalog.store';
import { CustomExercisesRepository } from '../exercises/custom-exercises.repository';
import { catalogChoice, customChoice, exerciseSnapshot, type ExerciseChoice } from '../exercises/exercise-catalog.model';
import { RoutineEditorStore } from './routine-editor.store';
import { duplicateWeek, editRows, newExercise, newWeek, type RowAction } from './routine-planning';
import type { RoutineWeekDraft } from './routine.model';
import { WeekEditor } from './week-editor';
import { RowActions } from './row-actions';
import { RoutinePickerDialog } from './routine-picker-dialog';
import { RoutineComparison } from './routine-comparison';

@Component({ selector: 'app-routine-editor', providers: [RoutineEditorStore], imports: [ReactiveFormsModule, Button, WeekEditor, RowActions, RoutineComparison],
  changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './routine-editor.html', styleUrl: './routine-editor.scss' })
export class RoutineEditor implements OnInit {
  readonly personId = input.required<UUID>(); readonly editorKey = input.required<string>(); readonly planId = input<UUID>();
  readonly saved = output<void>(); readonly closed = output<void>();
  readonly store = inject(RoutineEditorStore);
  private readonly coordinator = inject(DraftCoordinator);
  private readonly destroy = inject(DestroyRef);
  private readonly catalog = inject(ExerciseCatalogStore);
  private readonly custom = inject(CustomExercisesRepository);
  private readonly dialog = inject(Dialog);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private picking = false;
  readonly form = new FormGroup({ name: new FormControl('', { nonNullable: true }), notes: new FormControl('', { nonNullable: true }) });
  constructor() {
    let focused = false;
    effect(() => { const element = this.nameInput(); if (element && !focused) { element.nativeElement.focus(); focused = true; } });
    effect(() => { const value = this.store.value(); this.form.setValue({ name: value.name, notes: value.content.notes }, { emitEvent: false }); });
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
      const value = this.form.getRawValue(); this.store.change(value.name, { ...this.store.value().content, notes: value.notes });
    });
  }
  async ngOnInit(): Promise<void> {
    this.destroy.onDestroy(this.coordinator.register(() => this.store.flush()));
    await this.store.initialize(this.personId(), this.editorKey(), this.planId());
  }
  replaceWeek(week: RoutineWeekDraft): void { this.weeks(this.store.value().content.weeks.map(item => item.id === week.id ? week : item)); }
  act(week: RoutineWeekDraft, action: RowAction): void { this.weeks(editRows(this.store.value().content.weeks, week.id, action, duplicateWeek)); }
  addWeek(): void { this.weeks([...this.store.value().content.weeks, newWeek()]); }
  private weeks(weeks: RoutineWeekDraft[]): void { this.store.change(this.store.value().name, { ...this.store.value().content, weeks }); }
  async pick(dayId: UUID): Promise<void> {
    if (this.picking || this.store.saving()) return;
    this.picking = true;
    try {
      await this.catalog.load();
      if (this.catalog.status() !== 'ready') throw new Error(this.catalog.error());
      const custom = await this.custom.list(this.personId());
      if (this.destroy.destroyed) return;
      const ref = this.dialog.open<ExerciseChoice>(RoutinePickerDialog, { ariaLabelledBy: 'routine-picker-title', data: [...this.catalog.exercises().map(catalogChoice), ...custom.filter(item => !item.archived).map(customChoice)] });
      const unregister = this.destroy.onDestroy(() => ref.close());
      let choice: ExerciseChoice | undefined;
      try { choice = await firstValueFrom(ref.closed); } finally { unregister(); }
      if (choice && !this.destroy.destroyed) {
        const exercise = newExercise(exerciseSnapshot(choice));
        this.weeks(this.store.value().content.weeks.map(week => ({ ...week, days: week.days.map(day => day.id === dayId ? { ...day, exercises: [...day.exercises, exercise] } : day) })));
      }
    } catch (error) { this.store.error.set(storageFailure(error).message); }
    finally { this.picking = false; }
  }
  async save(): Promise<void> { if (await this.store.save()) this.saved.emit(); }
  async close(): Promise<void> { if (await this.store.flush()) this.closed.emit(); }
}
