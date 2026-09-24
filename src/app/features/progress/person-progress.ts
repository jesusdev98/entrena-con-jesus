import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { localDate, type UUID } from '../../core/domain/identity';
import { storageFailure } from '../../core/storage/database';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import type { Person } from '../people/person.model';
import { TrainingRepository } from '../training/training.repository';
import type { TrainingSession } from '../training/training.model';
import { SessionSummary } from '../training/session-summary';
import { completedCount, monday, shiftDate, today, weekSessions } from './training-history';
import { ProgressExport, pdfFilename } from '../pdf/progress-export';

@Component({ selector: 'app-person-progress', imports: [ReactiveFormsModule, RouterLink, Button, Card, SessionSummary], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './person-progress.html' })
export class PersonProgress implements OnInit {
  readonly person = input.required<Person>(); private readonly repository = inject(TrainingRepository); private readonly destroy = inject(DestroyRef); private owner!: UUID;
  readonly pdf = inject(ProgressExport);
  readonly sessions = signal<TrainingSession[]>([]); readonly error = signal(''); readonly loading = signal(true);
  readonly form = new FormGroup({ week: new FormControl<string>(today(), { nonNullable: true }), compare: new FormControl<string>(shiftDate(today(), -7), { nonNullable: true }), exercise: new FormControl('', { nonNullable: true }), date: new FormControl('', { nonNullable: true }) });
  private readonly filters = signal(this.form.getRawValue()); readonly count = completedCount;
  readonly exerciseId = computed(() => this.filters().exercise);
  readonly choices = computed(() => {
    const choices = new Map<string, string>();
    for (const session of this.sessions()) for (const item of session.exercises) choices.set(item.exercise.exerciseId, item.exercise.name);
    return [...choices].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });
  readonly weeks = computed(() => {
    const filters = this.filters();
    try { return [filters.week, filters.compare].map((value, index) => { const date = monday(localDate(value)); return { label: index ? 'Semana de comparación' : 'Semana seleccionada', date, end: shiftDate(date, 6), sessions: weekSessions(this.sessions(), this.person().id, date, filters.exercise, filters.date ? localDate(filters.date) : '') }; }); }
    catch { return []; }
  });
  constructor() { this.form.valueChanges.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.filters.set(this.form.getRawValue())); }
  ngOnInit(): void { this.owner = this.person().id; void this.load(); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { const sessions = await this.repository.list(this.owner); if (!this.destroy.destroyed) this.sessions.set(sessions.filter(session => session.status === 'completed')); }
    catch (error) { this.error.set(storageFailure(error).message); } finally { this.loading.set(false); }
  }
  move(days: number): void { try { this.form.controls.week.setValue(shiftDate(localDate(this.form.controls.week.value), days)); } catch { this.error.set('Indica una fecha válida.'); } }
  openDate(date: string): void { this.form.controls.week.setValue(date); }
  async exportPdf(): Promise<void> {
    const owner = this.person().id, filters = this.form.getRawValue();
    try {
      const start = monday(localDate(filters.week)), end = shiftDate(start, 6);
      const date = filters.date ? localDate(filters.date) : null;
      const selection = `${start}:${date ?? ''}:${filters.exercise}`;
      await this.pdf.run(owner, selection, () => this.person().id === owner &&
        `${monday(localDate(this.form.controls.week.value))}:${this.form.controls.date.value}:${this.form.controls.exercise.value}` === selection,
        pdfFilename('entrenamiento', this.person().displayName, date ?? start), async person => {
          const sessions = (await this.repository.list(owner)).filter(item => item.status === 'completed' && item.date >= start && item.date <= end &&
            (!date || item.date === date) && (!filters.exercise || item.exercises.some(exercise => exercise.exercise.exerciseId === filters.exercise)));
          const selected = structuredClone(sessions).map(session => ({ ...session, exercises: filters.exercise ? session.exercises.filter(item => item.exercise.exerciseId === filters.exercise) : session.exercises }));
          const { trainingDocument } = await import('../pdf/training-document');
          const { renderPdf } = await import('../pdf/pdf-export');
          return renderPdf(trainingDocument(person, start, end, date, selected));
        });
    } catch { this.pdf.error.set('Indica una semana y fecha válidas para exportar.'); }
  }
  pdfSelection(): string {
    try { return `${monday(localDate(this.form.controls.week.value))}:${this.form.controls.date.value}:${this.form.controls.exercise.value}`; }
    catch { return ''; }
  }
}
