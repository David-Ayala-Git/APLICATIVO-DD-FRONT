import { Component, computed, input } from '@angular/core';

export interface BarDatum {
  label: string;
  value: number;
  /** Texto que se muestra sobre la barra; por defecto el valor crudo. */
  display?: string;
}

/**
 * Grafico de barras del mockup. Escala contra el maximo de la serie, asi que
 * sirve igual para pesos recaudados que para numero de clientes.
 */
@Component({
  selector: 'app-bar-chart',
  template: `
    <div class="chart-bars">
      @for (bar of scaled(); track bar.label) {
        <div class="cbar" [title]="bar.label + ': ' + bar.display">
          <div class="val">{{ bar.display }}</div>
          <div class="fill" [style.height.%]="bar.height"></div>
          <div class="lbl">{{ bar.label }}</div>
        </div>
      }
    </div>
  `,
})
export class BarChartComponent {
  readonly data = input.required<BarDatum[]>();

  protected readonly scaled = computed(() => {
    const rows = this.data();
    const max = Math.max(...rows.map((r) => r.value), 0);
    return rows.map((r) => ({
      label: r.label,
      display: r.display ?? String(r.value),
      // 4% minimo para que una barra en cero siga siendo visible
      height: max > 0 ? Math.max((r.value / max) * 100, 4) : 4,
    }));
  });
}
