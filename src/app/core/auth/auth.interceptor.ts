import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { API } from '../api/api.config';
import { AuthService } from './auth.service';

/**
 * Pone el Bearer en toda llamada a la API salvo el login, y cierra la sesion
 * cuando el gateway responde 401 (token invalido o expirado).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const isLogin = req.url.endsWith(API.auth.login);
  const header = isLogin ? null : auth.authorizationHeader();

  const outgoing = header ? req.clone({ setHeaders: { Authorization: header } }) : req;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isLogin) {
        auth.logout();
      }
      return throwError(() => error);
    }),
  );
};
