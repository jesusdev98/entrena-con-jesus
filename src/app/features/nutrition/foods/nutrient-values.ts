import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Nutrients } from '../nutrition.model';

@Component({ selector: 'app-nutrient-values', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<dl><div><dt>Energía</dt><dd>{{ format(values().kcal) }} kcal</dd></div>
    <div><dt>Proteínas</dt><dd>{{ format(values().protein) }} g</dd></div>
    <div><dt>Carbohidratos</dt><dd>{{ format(values().carbohydrate) }} g</dd></div>
    <div><dt>Grasas</dt><dd>{{ format(values().fat) }} g</dd></div></dl>`,
  styles: `dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; margin: 0; }
    dt { font-size: .8rem; color: var(--muted); } dd { margin: 0; font-weight: 650; overflow-wrap: anywhere; }` })
export class NutrientValues {
  readonly values = input.required<Nutrients>();
  private readonly formatter = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });
  protected format(value: number): string { return this.formatter.format(value); }
}
