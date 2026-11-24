import { Component, input } from '@angular/core';

/** Encabezado de pagina: titulo, bajada y acciones a la derecha. */
@Component({
  selector: 'app-page-head',
  template: `
    <div class="page-head">
      <div>
        <h2>{{ title() }}</h2>
        @if (subtitle()) {
          <p>{{ subtitle() }}</p>
        }
      </div>
      <div class="head-actions">
        <ng-content />
      </div>
    </div>
  `,
})
export class PageHeadComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
