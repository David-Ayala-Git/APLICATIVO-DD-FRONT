import { Component, input } from '@angular/core';

import { Label } from '../labels';

/** Badge a partir de una etiqueta ya traducida en shared/labels.ts. */
@Component({
  selector: 'app-status-badge',
  template: `
    <span class="badge {{ label().badge }}">
      @if (label().dot) {
        <i class="fas fa-circle"></i>
      }
      {{ label().text }}
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly label = input.required<Label>();
}
