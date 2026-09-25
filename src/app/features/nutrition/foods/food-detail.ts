import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { NumberField } from '../../../shared/ui/number-field';
import { NutrientValues } from './nutrient-values';
import { preparationLabels, scaleFood, type FoodChoice } from './food.model';

@Component({ selector: 'app-food-detail', imports: [NumberField, NutrientValues], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack">
    <section aria-label="Valores por 100 gramos"><h3>Por 100 g de porción comestible</h3><app-nutrient-values [values]="food().per100g" /></section>
    @let selected = food();
    @if (selected.kind === 'usda') {
      <section aria-label="Procedencia"><h3>USDA FoodData Central · CC0 1.0</h3>
        <p>{{ selected.entry.group }} · {{ preparations[selected.entry.preparation] }}</p>
        <p>Descripción original: <span lang="en">{{ selected.entry.source.originalDescription }}</span></p>
        <p>Grupo original: <span lang="en">{{ selected.entry.source.originalGroup }}</span></p>
         <p>Versión de la fuente: {{ selected.entry.source.version }}<br />Energía publicada: {{ energyMethods[selected.entry.source.energyNutrientId] }}.</p>
         <a [href]="'https://fdc.nal.usda.gov/food-details/' + selected.entry.source.fdcId + '/nutrients'" target="_blank" rel="noopener noreferrer">Consultar ficha del alimento en USDA (requiere conexión; nueva pestaña)</a>
      </section>
    } @else {
      <section aria-label="Procedencia"><h3>Datos aportados por la persona</h3>
        <p>Alimento personalizado. Valores introducidos manualmente, sin verificación de USDA.</p>
        <p>Referencia: {{ selected.entry.source?.note || 'Sin referencia adicional' }}</p>
        <p>Preparación no especificada; consulta el nombre y la referencia.</p>
      </section>
    }
    <section class="stack" aria-label="Vista previa por gramos"><h3>Vista previa de cantidad</h3>
      <app-number-field id="preview-grams" label="Cantidad (g)" [control]="grams" [min]="0" step="any" hint="Solo una vista previa; no registra consumo." />
      <div aria-live="polite">@if (scaled(); as values) { <app-nutrient-values [values]="values" /> }
        @else { <p class="error">Introduce una cantidad finita igual o mayor que cero.</p> }</div>
      <small>Valores mostrados con hasta dos decimales. La energía conserva el valor publicado; no se sustituye por una fórmula de macronutrientes.</small>
    </section>
  </div>`, styles: `:host { display: block; overflow-wrap: anywhere; } h3 { margin-bottom: .5rem; }` })
export class FoodDetail {
  readonly food = input.required<FoodChoice>();
  readonly grams = new FormControl<number | null>(100, [Validators.required, Validators.min(0)]);
  private readonly quantity = toSignal(this.grams.valueChanges, { initialValue: 100 });
  protected readonly preparations = preparationLabels;
  protected readonly energyMethods = { 2048: 'Atwater específico', 2047: 'Atwater general', 1008: 'energía publicada histórica' };
  readonly scaled = computed(() => { const grams = this.quantity(); if (grams === null) return null; try { return scaleFood(this.food().per100g, grams); } catch { return null; } });
}
