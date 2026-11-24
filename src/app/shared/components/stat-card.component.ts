import { Component, input } from '@angular/core';

export type StatTone = 'violet' | 'cyan' | 'green' | 'orange' | 'red';
export type StatTrend = 'up' | 'down' | 'flat';

/** Tarjeta de metrica del mockup: icono, etiqueta, valor y nota de tendencia. */
@Component({
  selector: 'app-stat-card',
  template: `
    <div class="stat-card">
      <div class="stat-icon {{ tone() }}">
        <i class="{{ icon() }}"></i>
      </div>
      <div>
        <div class="stat-label">{{ label() }}</div>
        <div class="stat-value">{{ value() }}</div>
        @if (note()) {
          <div class="stat-change {{ trend() }}">
            @if (trend() === 'up') {
              <i class="fas fa-arrow-up"></i>
            } @else if (trend() === 'down') {
              <i class="fas fa-arrow-down"></i>
            }
            {{ note() }}
          </div>
        }
      </div>
    </div>
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input.required<string>();
  readonly tone = input<StatTone>('violet');
  readonly note = input<string>('');
  readonly trend = input<StatTrend>('flat');
}
