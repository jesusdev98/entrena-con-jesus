import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { Point } from './progress-series';

@Component({ selector: 'app-series-chart', imports: [DecimalPipe], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<figure class="series-chart" [attr.aria-label]="title() + ', ' + unit()">
    <figcaption><h3>{{ title() }}</h3><p>{{ unit() }} · {{ targetLabel() ? 'Real (azul) · Objetivo guardado (naranja)' : 'Real (azul)' }}. Sin dato significa que no hay registro.</p></figcaption>
    <svg viewBox="0 0 600 140" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <line x1="20" y1="115" x2="580" y2="115" stroke="currentColor" />
      @for (point of points(); track point.label; let i = $index) {
        @if (point.actual !== null) {
          @if (point.actual === 0) { <circle [attr.cx]="x(i, false)" cy="115" r="3" fill="#155ca0" /> }
          @else { <rect [attr.x]="x(i, false) - barWidth() / 2" [attr.y]="115 - height(point.actual)" [attr.width]="barWidth()" [attr.height]="height(point.actual)" fill="#155ca0" /> }
        }
        @if (targetLabel() && point.target !== null && point.target !== undefined) {
          @if (point.target === 0) { <circle [attr.cx]="x(i, true)" cy="115" r="3" fill="#a34a08" /> }
          @else { <rect [attr.x]="x(i, true) - barWidth() / 2" [attr.y]="115 - height(point.target)" [attr.width]="barWidth()" [attr.height]="height(point.target)" fill="#a34a08" /> }
        }
      }
    </svg>
    <details><summary>Ver datos de {{ title() }}</summary><div class="series-table"><table>
      <caption>{{ title() }} ({{ unit() }})</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Real</th>@if (targetLabel()) { <th scope="col">{{ targetLabel() }}</th> }@if (hasNotes()) { <th scope="col">Origen</th> }</tr></thead>
      <tbody>@for (point of points(); track point.label) { <tr><th scope="row">{{ point.label }}</th><td>{{ point.actual === null ? 'Sin registro' : (point.actual | number:'1.0-1') }}</td>
        @if (targetLabel()) { <td>{{ point.target === null || point.target === undefined ? 'Sin objetivo guardado' : (point.target | number:'1.0-1') }}</td> }
        @if (hasNotes()) { <td>{{ point.note || 'Sin registro' }}</td> }</tr> }</tbody>
    </table></div></details>
  </figure>`, styles: `:host { display:block; min-width:0 } .series-chart { margin:0; padding:.8rem; border:1px solid var(--line); border-radius:1rem; min-width:0 }
    h3 { margin:0 } p { margin:.35rem 0; font-size:.88rem } svg { width:100%; height:auto; display:block; max-height:140px }
    .series-table { overflow-x:auto; max-width:100% } table { width:100%; border-collapse:collapse; text-align:left; font-size:.88rem }
    th,td { padding:.35rem; border-bottom:1px solid var(--line) } summary { cursor:pointer; padding:.45rem 0 }` })
export class SeriesChart {
  readonly title = input.required<string>(); readonly unit = input.required<string>(); readonly points = input.required<readonly Point[]>();
  readonly targetLabel = input('');
  readonly hasNotes = computed(() => this.points().some(point => point.note));
  private readonly maximum = computed(() => Math.max(1, ...this.points().flatMap(point => [point.actual ?? 0, point.target ?? 0])));
  readonly barWidth = computed(() => Math.min(14, 480 / Math.max(1, this.points().length) / (this.targetLabel() ? 3 : 2)));
  height(value: number): number { return Math.max(0, value / this.maximum() * 95); }
  x(index: number, target: boolean): number {
    const step = 540 / Math.max(1, this.points().length);
    return 30 + (index + .5) * step + (this.targetLabel() ? (target ? 1 : -1) * this.barWidth() / 1.5 : 0);
  }
}
