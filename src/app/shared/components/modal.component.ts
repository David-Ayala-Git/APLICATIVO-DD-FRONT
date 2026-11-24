import { Component, HostListener, booleanAttribute, input, output } from '@angular/core';

/**
 * Dialogo del mockup. Cierra con Escape o clic en el fondo; el contenido y el
 * pie se proyectan desde la pagina que lo abre.
 */
@Component({
  selector: 'app-modal',
  template: `
    <div class="modal-overlay" (click)="onBackdrop($event)">
      <div
        class="modal"
        [class.wide]="wide()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
      >
        <div class="modal-header">
          <h3>{{ title() }}</h3>
          <button type="button" class="modal-close" aria-label="Cerrar" (click)="close.emit()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <ng-content />
        </div>
        <div class="modal-footer">
          <ng-content select="[modalFooter]" />
        </div>
      </div>
    </div>
  `,
})
export class ModalComponent {
  readonly title = input.required<string>();
  /** `<app-modal wide>` basta; booleanAttribute acepta el atributo sin valor. */
  readonly wide = input(false, { transform: booleanAttribute });
  readonly close = output<void>();

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }
}
