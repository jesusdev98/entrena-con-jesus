import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { localDate, type UUID } from '../../core/domain/identity';
import { storageFailure } from '../../core/storage/database';
import { Button } from '../../shared/ui/button';
import type { Person } from '../people/person.model';
import type { RoutineRevision } from '../routines/routine.model';
import { RoutinesRepository } from '../routines/routines.repository';
import { today } from '../progress/training-history';
import { TrainingRepository, type TrainingDraft } from './training.repository';
import { TrainingEditor } from './training-editor';

@Component({ selector: 'app-person-training', imports: [ReactiveFormsModule, RouterLink, Button, TrainingEditor], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './person-training.html' })
export class PersonTraining implements OnInit {
  readonly person = input.required<Person>(); readonly initialRevision = input(''); readonly initialSession = input('');
  private readonly repository = inject(TrainingRepository); private readonly routines = inject(RoutinesRepository); private readonly destroy = inject(DestroyRef);
  readonly plans = signal<RoutineRevision[]>([]); readonly drafts = signal<TrainingDraft[]>([]); readonly editor = signal<UUID | null>(null);
  readonly error = signal(''); readonly message = signal(''); readonly busy = signal(false); private owner!: UUID;
  readonly form = new FormGroup({ revision: new FormControl('', { nonNullable: true }), week: new FormControl('', { nonNullable: true }), day: new FormControl('', { nonNullable: true }), date: new FormControl(today(), { nonNullable: true }) });
  async ngOnInit(): Promise<void> {
    this.owner = this.person().id; await this.load();
    this.form.controls.revision.setValue(this.plans().find(p => p.id === this.initialRevision())?.id ?? this.plans()[0]?.id ?? ''); this.selectPlan();
    if (this.initialSession() && !this.destroy.destroyed) await this.reopen(this.initialSession() as UUID);
  }
  plan() { return this.plans().find(p => p.id === this.form.controls.revision.value); }
  planLabel(plan: RoutineRevision): string {
    const same = this.plans().filter(item => item.name === plan.name);
    return `${plan.name}${same.length > 1 ? ` · rutina ${same.findIndex(item => item.id === plan.id) + 1}` : ''} · ${plan.content.weeks.length} semanas`;
  }
  week() { return this.plan()?.content.weeks.find(w => w.id === this.form.controls.week.value); }
  selectPlan(): void { this.form.controls.week.setValue(this.plan()?.content.weeks[0]?.id ?? ''); this.selectWeek(); }
  selectWeek(): void { this.form.controls.day.setValue(this.week()?.days[0]?.id ?? ''); }
  async load(): Promise<void> {
    this.busy.set(true);
    try { const [plans, drafts] = await Promise.all([this.routines.list(this.owner), this.repository.listDrafts(this.owner)]);
      if (!this.destroy.destroyed) { this.plans.set(plans.filter(plan => !plan.archived)); this.drafts.set(drafts); }
    } catch (error) { this.error.set(storageFailure(error).message); } finally { this.busy.set(false); }
  }
  async start(): Promise<void> {
    if (this.busy()) return; this.busy.set(true); this.error.set(''); this.message.set('');
    try { const v = this.form.getRawValue(); const draft = await this.repository.start(this.owner, v.revision as UUID, v.week as UUID, v.day as UUID, localDate(v.date));
      if (!this.destroy.destroyed) this.editor.set(draft.payload.session.id);
    } catch (error) { this.error.set(storageFailure(error).message); } finally { this.busy.set(false); }
  }
  async reopen(id: UUID): Promise<void> {
    try { const draft = await this.repository.reopen(this.owner, id); if (!this.destroy.destroyed) this.editor.set(draft.payload.session.id); }
    catch (error) { this.error.set(storageFailure(error).message); }
  }
  async close(saved = false): Promise<void> { this.editor.set(null); await this.load(); this.message.set(saved ? 'Sesión finalizada y guardada. Ya aparece en el historial.' : 'Borrador conservado para continuar.'); }
}
