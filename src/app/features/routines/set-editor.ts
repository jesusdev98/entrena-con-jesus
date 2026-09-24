import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NumberField } from '../../shared/ui/number-field';
import type { PlannedSetDraft } from './routine.model';

@Component({ selector: 'app-set-editor', imports: [ReactiveFormsModule, NumberField], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<fieldset class="stack" [formGroup]="form"><legend>Objetivo de la serie {{ position() }}</legend><div class="grid">
    @if (repetitions()) {
      <app-number-field [id]="value().id + '-min'" label="Repeticiones mínimas" [control]="form.controls.minimum" [min]="1" hint="Obligatorio · entero" />
      <app-number-field [id]="value().id + '-max'" label="Repeticiones máximas" [control]="form.controls.maximum" [min]="1" hint="Obligatorio · igual o mayor que el mínimo" />
      @if (value().type === 'weight-reps') { <app-number-field [id]="value().id + '-weight'" label="Peso externo (kg)" [control]="form.controls.weight" [min]="0" step="any" hint="Opcional · 0 significa sin carga externa" /> }
      @if (value().type === 'assisted-reps') { <app-number-field [id]="value().id + '-assistance'" label="Asistencia (kg)" [control]="form.controls.weight" [min]="0" step="any" hint="Opcional · ayuda, no peso levantado" /> }
      @if (value().type === 'bodyweight-reps') { <p class="muted">Peso corporal, sin carga externa prescrita.</p> }
      <app-number-field [id]="value().id + '-rir'" label="RIR objetivo" [control]="form.controls.rir" [min]="0" step="any" hint="Opcional · repeticiones en reserva" />
    } @else {
      @if (value().type === 'distance-duration') { <app-number-field [id]="value().id + '-meters'" label="Distancia (m)" [control]="form.controls.meters" [min]="0" step="any" hint="Obligatorio · mayor que cero" /> }
      <app-number-field [id]="value().id + '-seconds'" label="Duración (s)" [control]="form.controls.seconds" [min]="0" step="any" [hint]="value().type === 'duration' ? 'Obligatorio · mayor que cero' : 'Opcional · mayor que cero si se indica'" />
    }
    <app-number-field [id]="value().id + '-rest'" label="Descanso (s)" [control]="form.controls.rest" [min]="0" step="any" hint="Opcional · 0 significa sin descanso" />
    </div><div class="field"><label [for]="value().id + '-notes'">Notas de la serie</label><input [id]="value().id + '-notes'" formControlName="notes" maxlength="1000" /></div></fieldset>` })
export class SetEditor {
  readonly value = input.required<PlannedSetDraft>(); readonly position = input.required<number>(); readonly changed = output<PlannedSetDraft>();
  readonly form = new FormGroup({ minimum: new FormControl<number | null>(null), maximum: new FormControl<number | null>(null), weight: new FormControl<number | null>(null), rir: new FormControl<number | null>(null), meters: new FormControl<number | null>(null), seconds: new FormControl<number | null>(null), rest: new FormControl<number | null>(null), notes: new FormControl('', { nonNullable: true }) });
  repetitions(): boolean { return 'reps' in this.value(); }
  constructor() {
    effect(() => { const set = this.value(); this.form.setValue({ minimum: 'reps' in set ? set.reps.minimum : null, maximum: 'reps' in set ? set.reps.maximum : null,
      weight: 'weightKg' in set ? set.weightKg : 'assistanceKg' in set ? set.assistanceKg : null, rir: 'targetRir' in set ? set.targetRir : null,
      meters: 'meters' in set ? set.meters : null, seconds: 'seconds' in set ? set.seconds : null, rest: set.restSeconds, notes: set.notes }, { emitEvent: false }); });
    this.form.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => {
      const value = this.form.getRawValue(); const set = this.value(); const base = { id: set.id, type: set.type, restSeconds: value.rest, notes: value.notes };
      const reps = { minimum: value.minimum, maximum: value.maximum };
      switch (set.type) {
        case 'weight-reps': this.changed.emit({ ...base, type: set.type, reps, weightKg: value.weight, targetRir: value.rir }); break;
        case 'bodyweight-reps': this.changed.emit({ ...base, type: set.type, reps, targetRir: value.rir }); break;
        case 'assisted-reps': this.changed.emit({ ...base, type: set.type, reps, assistanceKg: value.weight, targetRir: value.rir }); break;
        case 'duration': this.changed.emit({ ...base, type: set.type, seconds: value.seconds }); break;
        case 'distance-duration': this.changed.emit({ ...base, type: set.type, meters: value.meters, seconds: value.seconds }); break;
      }
    });
  }
}
