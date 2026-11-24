import { DestroyRef, Signal, inject, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

import { describeHttpError } from '../ui/http-error';

export interface Collection<T> {
  /** Datos ya cargados. Antes de la primera respuesta es el valor inicial. */
  readonly value: Signal<T>;
  readonly loading: Signal<boolean>;
  /** Mensaje listo para mostrar, o null si la ultima carga fue bien. */
  readonly error: Signal<string | null>;
  /** Vuelve a pedir los datos cancelando una carga en vuelo. */
  readonly reload: () => void;
  /** Reemplaza los datos en memoria sin ir al servidor (p. ej. tras un POST). */
  readonly set: (value: T) => void;
  readonly update: (fn: (current: T) => T) => void;
}

/**
 * Envuelve una llamada HTTP en senales de datos/carga/error y la cancela al
 * destruir el componente. Es deliberadamente pequeno: `resource()` sigue marcado
 * como experimental en Angular 21 y aqui solo hacen falta estas cuatro cosas.
 */
export function collection<T>(loader: () => Observable<T>, initial: T): Collection<T> {
  const value = signal<T>(initial);
  const loading = signal(false);
  const error = signal<string | null>(null);

  let inFlight: Subscription | null = null;
  const destroyRef = inject(DestroyRef);
  destroyRef.onDestroy(() => inFlight?.unsubscribe());

  const reload = (): void => {
    inFlight?.unsubscribe();
    loading.set(true);
    error.set(null);
    inFlight = loader().subscribe({
      next: (data) => {
        value.set(data);
        loading.set(false);
      },
      error: (err: unknown) => {
        error.set(describeHttpError(err));
        loading.set(false);
      },
    });
  };

  reload();

  return {
    value: value.asReadonly(),
    loading: loading.asReadonly(),
    error: error.asReadonly(),
    reload,
    set: (next) => value.set(next),
    update: (fn) => value.update(fn),
  };
}
