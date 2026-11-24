import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { TenantService } from '../state/tenant.service';
import { ToastService } from '../ui/toast.service';
import { canAccessPage } from './access';
import { AuthService } from './auth.service';

/** Protege el shell: sin JWT vigente, al login (guardando el destino). */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login'], { queryParams: { redirectTo: state.url } });
};

/**
 * Bloquea por URL las paginas cuyo modulo esta apagado para el tenant o que el
 * rol no usa (ver access.ts); el menu ya las oculta, esto cubre el enlace
 * directo o un marcador viejo.
 */
export const pageGuard: CanActivateChildFn = (route) => {
  const auth = inject(AuthService);
  const tenants = inject(TenantService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const path = route.routeConfig?.path ?? '';

  return tenants.ensureLoaded().pipe(
    map((tenant) => {
      if (canAccessPage(path, auth.role(), tenant)) {
        return true;
      }
      toast.info('Esa pagina no esta disponible para tu rol o tu plan.');
      return router.createUrlTree(['/app/dashboard']);
    }),
  );
};

/** Elige la variante de una ruta segun si la sesion es del dueno de la plataforma. */
export const superAdminMatch: CanMatchFn = () => inject(AuthService).role() === 'SUPER_ADMIN';

/** Evita volver al login con una sesion abierta. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated() ? router.createUrlTree(['/app/dashboard']) : true;
};
