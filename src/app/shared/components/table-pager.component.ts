import { Component, computed, input } from '@angular/core';

import { TablePager } from '../pagination';

/**
 * Pie de paginacion reutilizable para todas las tablas de la consola.
 * Muestra rango visible, selector de tamano de pagina y navegacion responsiva.
 */
@Component({
  selector: 'app-table-pager',
  template: `
    @if (pager().total() > 0) {
      <div class="table-pager">
        <div class="table-pager-info">
          <span>
            Mostrando <b>{{ pager().startIndex() }}–{{ pager().endIndex() }}</b> de
            <b>{{ pager().total() }}</b>
          </span>
          <label class="table-pager-size">
            <span>Filas:</span>
            <select
              class="form-control"
              [value]="pager().pageSize()"
              (change)="pager().setPageSize(+$any($event.target).value)"
              aria-label="Registros por pagina"
            >
              @for (size of sizes; track size) {
                <option [value]="size">{{ size }}</option>
              }
            </select>
          </label>
        </div>

        @if (pager().totalPages() > 1) {
          <div class="table-pager-nav">
            <button
              type="button"
              class="btn btn-outline btn-sm"
              [disabled]="pager().page() <= 1"
              (click)="pager().setPage(pager().page() - 1)"
              aria-label="Pagina anterior"
            >
              <i class="fas fa-chevron-left"></i>
            </button>

            @for (entry of visiblePages(); track $index) {
              @if (entry === '...') {
                <span class="table-pager-dots">…</span>
              } @else {
                <button
                  type="button"
                  class="btn btn-sm"
                  [class.btn-grad]="entry === pager().page()"
                  [class.btn-outline]="entry !== pager().page()"
                  (click)="pager().setPage(entry)"
                >
                  {{ entry }}
                </button>
              }
            }

            <button
              type="button"
              class="btn btn-outline btn-sm"
              [disabled]="pager().page() >= pager().totalPages()"
              (click)="pager().setPage(pager().page() + 1)"
              aria-label="Pagina siguiente"
            >
              <i class="fas fa-chevron-right"></i>
            </button>
          </div>
        }
      </div>
    }
  `,
})
export class TablePagerComponent {
  readonly pager = input.required<TablePager<unknown>>();
  protected readonly sizes = [10, 25, 50];

  protected readonly visiblePages = computed<(number | '...')[]>(() => {
    const total = this.pager().totalPages();
    const current = this.pager().page();
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) {
      pages.push('...');
    }
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    if (end < total - 1) {
      pages.push('...');
    }
    pages.push(total);
    return pages;
  });
}
