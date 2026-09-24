import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { DailyCalculation } from './daily-target.model';

@Component({ selector: 'app-target-summary', imports: [DecimalPipe], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (calculation(); as calculation) { <section class="stack" aria-label="Resumen del objetivo">
    <h2>Objetivo diario estimado</h2>
    <p>{{ calculation.result.expenditure.provisional ? 'Previsión provisional de día completo: incluye previsiones o caminata por cadencia.' : 'Datos reales declarados; el gasto sigue siendo una estimación.' }}</p>
    <p>Gasto diario: <strong data-testid="expenditure">{{ calculation.result.expenditure.expenditureKcal | number:'1.2-2' }} kcal</strong></p>
    <p>Ajuste: {{ calculation.input.signedAdjustmentKcal | number:'1.0-2' }} kcal</p>
    <p>Objetivo: <strong data-testid="target-kcal">{{ calculation.result.targetKcal | number:'1.2-2' }} kcal</strong></p>
    <p>Proteínas: <strong data-testid="protein-grams">{{ calculation.result.macroGrams.protein | number:'1.2-2' }} g</strong> · {{ calculation.input.macroPercentages.protein }} %</p>
    <p>Carbohidratos: <strong>{{ calculation.result.macroGrams.carbohydrate | number:'1.2-2' }} g</strong> · {{ calculation.input.macroPercentages.carbohydrate }} %</p>
    <p>Grasas: <strong>{{ calculation.result.macroGrams.fat | number:'1.2-2' }} g</strong> · {{ calculation.input.macroPercentages.fat }} %</p>
    @if (calculation.result.expenditure; as energy) {
      @if (energy.mode === 'estimated') {
        <p>Basal: {{ energy.bmrKcal | number:'1.2-2' }} kcal · actividad neta: {{ energy.netActivityKcal | number:'1.2-2' }} kcal.</p>
        <p>Pasos adicionales: {{ energy.residualSteps }} · caminata: {{ energy.walking.minutes | number:'1.0-2' }} min · tiempo total: {{ energy.totalMinutes | number:'1.0-2' }} min.</p>
        <p>Selección: pasos {{ status(energy.selection.totalSteps) }}, trabajo {{ status(energy.selection.work) }}, entrenamiento {{ status(energy.selection.training) }}. Cada dato real reemplaza su previsión.</p>
        <p>Supuesto: las duraciones ocupan períodos distintos, sin solapamiento. {{ energy.timing.checkedIntervals }} intervalos horarios comprobados; las duraciones sin horario no demuestran ausencia de solapamiento.</p>
        <p>Termogénesis aproximada fija: 10 % a equilibrio energético. La ingesta no cambia este gasto.</p>
      } @else { <p>Gasto diario manual: {{ energy.reason }}. Total introducido, sin volver a aplicar termogénesis.</p> }
      <small>Versión: {{ energy.version }} · {{ calculation.result.macroVersion }}</small>
    }
    <p>Sin datos de consumo: el diario alimentario está pendiente. Este resumen no representa ingesta ni cumplimiento.</p>
  </section> }`, styles: `:host { display: block; } p { margin: 0; } small { overflow-wrap: anywhere; }` })
export class TargetSummary {
  readonly calculation = input<DailyCalculation | null>(null);
  status(value: string): string { return value === 'actual' ? 'reales' : 'previstos'; }
}
