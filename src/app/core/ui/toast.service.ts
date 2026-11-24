import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

/** Avisos efimeros de la esquina inferior: confirmaciones y errores de la API. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<Toast[]>([]);
  private nextId = 1;

  readonly toasts = this.items.asReadonly();

  success(text: string): void {
    this.push('success', text);
  }

  error(text: string): void {
    this.push('error', text);
  }

  info(text: string): void {
    this.push('info', text);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: ToastKind, text: string): void {
    const id = this.nextId++;
    this.items.update((list) => [...list, { id, kind, text }]);
    // los errores se quedan mas tiempo porque suelen traer instrucciones
    setTimeout(() => this.dismiss(id), kind === 'error' ? 7000 : 4000);
  }
}
