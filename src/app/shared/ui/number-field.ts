import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

@Component({ selector: 'app-number-field', imports: [ReactiveFormsModule], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="field"><label [for]="id() + '-input'">{{ label() }}</label>
    <input [id]="id() + '-input'" type="number" inputmode="decimal" [formControl]="control()" [min]="min()" [max]="max()" [step]="step()"
      [attr.aria-invalid]="control().touched && control().invalid" [attr.aria-describedby]="id() + '-help'" />
    <small [id]="id() + '-help'">{{ hint() }} @if (control().touched && control().invalid) { Revisa el valor. }</small></div>` })
export class NumberField {
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  readonly control = input.required<FormControl<number | null>>();
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly step = input<number | 'any'>(1);
  readonly hint = input('Opcional');
}
