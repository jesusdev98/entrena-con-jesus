import { Directive, input } from '@angular/core';

@Directive({ selector: 'button[appButton], a[appButton]', host: { class: 'app-button', '[class.secondary]': 'variant() === "secondary"', '[class.danger]': 'variant() === "danger"' } })
export class Button { readonly variant = input<'primary' | 'secondary' | 'danger'>('primary'); }
