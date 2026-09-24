import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NumberField } from '../../shared/ui/number-field';
import { Button } from '../../shared/ui/button';
import { actualText, completeSet, reopenSet, skipSet, targetText } from './training-domain';
import type { ActualSet, Performance, PerformanceDraft } from './training.model';

@Component({ selector: 'app-actual-set-editor', imports: [ReactiveFormsModule, NumberField, Button], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<fieldset class="stack" data-testid="actual-set"><legend>{{ label() }}</legend>
    <p><strong>Objetivo guardado:</strong> {{ target(value().prescribed) }}</p>
    @if (value().prescribed; as prescribed) { <p>Descanso: {{ prescribed.restSeconds ?? '—' }} s · {{ prescribed.notes || 'Sin notas de serie' }}</p> }
    <p role="status"><strong>{{ value().status === 'draft' ? 'Pendiente' : value().status === 'completed' ? 'Serie realizada' : 'No realizada' }}</strong></p>
    @if (error()) { <p role="alert" class="error">{{ error() }}</p> }
    @if (value().status === 'draft') {
      <div class="grid">
        @if (type() === 'weight-reps') { <app-number-field [id]="value().id + '-weight'" [label]="'Peso real (kg) · ' + label()" [control]="form.controls.weightKg" [min]="0" step="any" hint="Peso externo; cero es válido" /> }
        @if (type() === 'assisted-reps') { <app-number-field [id]="value().id + '-assistance'" [label]="'Asistencia real (kg) · ' + label()" [control]="form.controls.assistanceKg" [min]="0" step="any" hint="Ayuda recibida, no peso levantado" /> }
        @if (repetitions()) {
          @if (type() === 'bodyweight-reps') { <p>Peso corporal: registra las repeticiones realizadas.</p> }
          <app-number-field [id]="value().id + '-reps'" [label]="'Repeticiones reales · ' + label()" [control]="form.controls.reps" [min]="1" hint="Enteras, mayores que cero" />
          <app-number-field [id]="value().id + '-rir'" [label]="'RIR real · ' + label()" [control]="form.controls.rir" [min]="0" step="any" hint="Opcional; independiente del RPE" />
        } @else {
          @if (type() === 'distance-duration') { <app-number-field [id]="value().id + '-meters'" [label]="'Distancia real (m) · ' + label()" [control]="form.controls.meters" [min]="0" step="any" hint="Mayor que cero" /> }
          <app-number-field [id]="value().id + '-seconds'" [label]="'Duración real (s) · ' + label()" [control]="form.controls.seconds" [min]="0" step="any" hint="Mayor que cero" />
        }
        <app-number-field [id]="value().id + '-rpe'" [label]="'RPE real · ' + label()" [control]="form.controls.rpe" [min]="1" [max]="10" [step]="0.5" hint="Obligatorio al completar; 1 a 10, pasos de 0,5" />
      </div>
      <div class="actions"><button appButton type="button" (click)="done()">Completar {{ label() }}</button>
        <button appButton variant="secondary" type="button" (click)="skip()">No realizada · {{ label() }}</button></div>
    } @else {
      <p>{{ actual(value()) }}</p><button appButton variant="secondary" type="button" (click)="reopen()">Corregir {{ label() }}</button>
    }
  </fieldset>`, styles: `fieldset { min-width: 0; margin: 0; padding: 1rem; border: 1px solid var(--line); border-radius: .8rem; } legend { font-weight: 700; overflow-wrap: anywhere; }` })
export class ActualSetEditor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef); private readonly injector = inject(Injector);
  readonly value = input.required<ActualSet>(); readonly type = input.required<Performance['type']>(); readonly label = input.required<string>();
  readonly changed = output<ActualSet>(); readonly error = signal('');
  readonly target = targetText; readonly actual = actualText;
  readonly form = new FormGroup({ weightKg: new FormControl<number | null>(null), assistanceKg: new FormControl<number | null>(null), reps: new FormControl<number | null>(null),
    rir: new FormControl<number | null>(null), seconds: new FormControl<number | null>(null), meters: new FormControl<number | null>(null), rpe: new FormControl<number | null>(null) });
  constructor() {
    effect(() => { const set = this.value(); const a = set.actual;
      this.form.setValue({ weightKg: a && 'weightKg' in a ? a.weightKg : null, assistanceKg: a && 'assistanceKg' in a ? a.assistanceKg : null,
        reps: a && 'reps' in a ? a.reps : null, rir: a && 'rir' in a ? a.rir : null,
        seconds: a && 'seconds' in a ? a.seconds : null, meters: a && 'meters' in a ? a.meters : null, rpe: set.rpe }, { emitEvent: false });
    });
    this.form.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => {
      if (this.value().status !== 'draft') return;
      this.error.set(''); this.changed.emit(this.draftValue());
    });
  }
  repetitions(): boolean { return ['weight-reps', 'bodyweight-reps', 'assisted-reps'].includes(this.type()); }
  private draftValue(): ActualSet {
    const v = this.form.getRawValue(); const type = this.type(); let actual: PerformanceDraft;
    switch (type) {
      case 'weight-reps': actual = { type, weightKg: v.weightKg, reps: v.reps, rir: v.rir }; break;
      case 'assisted-reps': actual = { type, assistanceKg: v.assistanceKg, reps: v.reps, rir: v.rir }; break;
      case 'bodyweight-reps': actual = { type, reps: v.reps, rir: v.rir }; break;
      case 'duration': actual = { type, seconds: v.seconds }; break;
      case 'distance-duration': actual = { type, meters: v.meters, seconds: v.seconds }; break;
    }
    return { id: this.value().id, prescribed: this.value().prescribed, status: 'draft', actual, rpe: v.rpe };
  }
  private focusControl(): void { afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('input, button')?.focus(), { injector: this.injector }); }
  done(): void { try { this.changed.emit(completeSet(this.draftValue(), this.type())); this.error.set(''); this.focusControl(); } catch (error) { this.error.set((error as Error).message); } }
  skip(): void { this.error.set(''); this.changed.emit(skipSet(this.value())); this.focusControl(); }
  reopen(): void { this.error.set(''); this.changed.emit(reopenSet(this.value(), this.type())); this.focusControl(); }
}
