import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output } from '@angular/core';
import { FormControl } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NumberField } from './number-field';

/** Controlled nullable number input, sharing the native label/accessibility contract. */
@Component({ selector: 'app-numeric-value', imports: [NumberField], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-number-field [id]="fieldId()" [label]="label()" [control]="control" [step]="'any'" [hint]="hint()" />` })
export class NumericValue {
  readonly fieldId = input.required<string>(); readonly label = input.required<string>(); readonly value = input<number | null>(null);
  readonly hint = input('Vacío: sin dato. Cero: valor explícito.'); readonly changed = output<number | null>();
  readonly control = new FormControl<number | null>(null);
  constructor() {
    effect(() => this.control.setValue(this.value(), { emitEvent: false }));
    this.control.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(value => this.changed.emit(value));
  }
}
