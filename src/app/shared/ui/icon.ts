import { ChangeDetectionStrategy, Component, input } from '@angular/core';

const paths = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  training: 'M6 5v14M3 9v6M18 5v14M21 9v6M6 12h12',
  food: 'M5 3v6c0 3 4 3 4 0V3M7 3v18M18 3c-4 4-4 9 0 10V3Zm0 10v8',
  progress: 'M4 3v17h17M8 15l4-5 4 2 5-7',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6',
} as const;
export type IconName = keyof typeof paths;
@Component({ selector: 'app-icon', changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="paths[name()]" /></svg>',
  styles: ':host { display: inline-flex; width: 1.4rem; height: 1.4rem; flex-shrink: 0; } svg { width: 100%; height: 100%; }' })
export class Icon { readonly name = input.required<IconName>(); protected readonly paths = paths; }
