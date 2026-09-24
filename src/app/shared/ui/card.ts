import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({ selector: 'app-card', changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />', styles: ':host { display: block; min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: clamp(1.1rem, 3vw, 1.75rem); box-shadow: var(--shadow); }' })
export class Card {}
