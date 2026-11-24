import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/**
 * Onda de material al pulsar. Se aplica a los `.btn` del layout para
 * reproducir la micro-interaccion del mockup sin ensuciar las plantillas.
 */
@Directive({
  selector: '[appRipple]',
})
export class RippleDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    if (prefersReducedMotion()) {
      return;
    }
    const el = this.host.nativeElement;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);

    const ripple = document.createElement('span');
    ripple.className = 'rip';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
