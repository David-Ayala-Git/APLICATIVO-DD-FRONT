import { Component, input, output } from '@angular/core';

/**
 * Estados de una carga remota, iguales en las 19 pantallas: hilando, error con
 * reintento, o vacio. Cuando hay datos no pinta nada y deja pasar el contenido.
 */
@Component({
  selector: 'app-async-state',
  template: `
    @if (loading()) {
      <div class="loading-row">
        <i class="fas fa-circle-notch"></i>
        {{ loadingText() }}
      </div>
    } @else if (error()) {
      <div class="card-body">
        <div class="alert alert-danger">
          <i class="fas fa-triangle-exclamation"></i>
          <div class="flex-1">
            {{ error() }}
            <div style="margin-top:.6rem">
              <button type="button" class="btn btn-outline btn-sm" (click)="retry.emit()">
                <i class="fas fa-rotate"></i> Reintentar
              </button>
            </div>
          </div>
        </div>
      </div>
    } @else if (empty()) {
      <div class="empty">
        <i class="{{ emptyIcon() }}"></i>
        <div class="empty-title">{{ emptyTitle() }}</div>
        <p>{{ emptyText() }}</p>
      </div>
    }
  `,
})
export class AsyncStateComponent {
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly empty = input(false);
  readonly loadingText = input('Cargando datos del servicio…');
  readonly emptyTitle = input('Sin registros todavia');
  readonly emptyText = input('Cuando se cree el primer registro aparecera aqui.');
  readonly emptyIcon = input('fas fa-inbox');
  readonly retry = output<void>();
}
