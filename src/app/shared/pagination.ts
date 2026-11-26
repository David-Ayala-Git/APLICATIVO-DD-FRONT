import { Signal, computed, signal } from '@angular/core';

export interface TablePager<T> {
  readonly items: Signal<T[]>;
  readonly total: Signal<number>;
  readonly page: Signal<number>;
  readonly pageSize: Signal<number>;
  readonly totalPages: Signal<number>;
  readonly startIndex: Signal<number>;
  readonly endIndex: Signal<number>;
  setPage(next: number): void;
  setPageSize(size: number): void;
  reset(): void;
}

/**
 * Paginacion reactiva sobre cualquier senal de lista filtrada.
 * Si el filtro reduce la cantidad de elementos, la pagina actual se ajusta
 * automaticamente para no quedarse en una pagina vacia.
 */
export function paginate<T>(source: Signal<T[]>, initialPageSize = 10): TablePager<T> {
  const pageSignal = signal(1);
  const pageSizeSignal = signal(initialPageSize);

  const total = computed(() => source().length);
  const totalPages = computed(() => Math.max(1, Math.ceil(total() / pageSizeSignal())));
  const page = computed(() => Math.min(Math.max(1, pageSignal()), totalPages()));
  const startIndex = computed(() => (total() === 0 ? 0 : (page() - 1) * pageSizeSignal() + 1));
  const endIndex = computed(() => Math.min(total(), page() * pageSizeSignal()));

  const items = computed(() => {
    const start = (page() - 1) * pageSizeSignal();
    return source().slice(start, start + pageSizeSignal());
  });

  return {
    items,
    total,
    page,
    pageSize: pageSizeSignal.asReadonly(),
    totalPages,
    startIndex,
    endIndex,
    setPage(next: number): void {
      pageSignal.set(Math.min(Math.max(1, next), totalPages()));
    },
    setPageSize(size: number): void {
      pageSizeSignal.set(size);
      pageSignal.set(1);
    },
    reset(): void {
      pageSignal.set(1);
    },
  };
}
