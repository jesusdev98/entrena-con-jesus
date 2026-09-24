import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({ selector: 'app-progress-ring', imports: [DecimalPipe], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<figure><svg viewBox="0 0 120 120" role="img" [attr.aria-label]="description()">
    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" stroke-width="9" />
    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--primary)" stroke-width="9" pathLength="100"
      [attr.stroke-dasharray]="percent() + ' 100'" transform="rotate(-90 60 60)" stroke-linecap="round" />
    <text x="60" y="63" text-anchor="middle" fill="var(--ink)" font-size="17" font-weight="700">{{ value() | number:'1.0-1' }}</text>
  </svg><figcaption>{{ description() }}</figcaption></figure>`,
  styles: 'figure { margin: 0; text-align: center; } svg { max-width: 9rem; } figcaption { font-size: .85rem; color: var(--muted); }' })
export class ProgressRing {
  readonly value = input.required<number>(); readonly target = input.required<number>(); readonly label = input.required<string>();
  protected readonly percent = computed(() => {
    const value = this.value(), target = this.target();
    return Number.isFinite(value) && Number.isFinite(target) && target > 0 ? Math.max(0, Math.min(100, value / target * 100)) : 0;
  });
  protected readonly description = computed(() => {
    const value = this.value(), target = this.target(), show = (amount: number) => Number.isFinite(amount) ? amount.toLocaleString('es', { maximumFractionDigits: 2 }) : 'sin dato';
    return `${this.label()}: ${show(value)} de ${show(target)}${target === 0 ? '; objetivo cero' : ''}${value > target ? `; exceso: ${show(value - target)}` : ''}`;
  });
}
