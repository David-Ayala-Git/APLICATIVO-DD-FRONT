import { HttpErrorResponse } from '@angular/common/http';

/** Forma del ErrorResponse que devuelven todos los microservicios. */
interface BackendError {
  status?: number;
  error?: string;
  message?: string;
  path?: string;
}

/** Donde ocurrio el error: cambia como se lee un 401. */
export type ErrorContext = 'session' | 'login';

/**
 * Traduce un error HTTP a un mensaje en espanol para el operador, usando el
 * `message` del backend cuando existe y explicando los codigos propios de la
 * plataforma (403 de modulo desactivado, 502 de integracion externa caida).
 */
export function describeHttpError(err: unknown, context: ErrorContext = 'session'): string {
  if (!(err instanceof HttpErrorResponse)) {
    return 'Ocurrio un error inesperado.';
  }

  const body = (err.error ?? {}) as BackendError;
  const fromBackend = typeof body.message === 'string' && body.message.trim() ? body.message : null;

  switch (err.status) {
    case 0:
      return 'No hay conexion con la API. Si el backend en Render estaba dormido, espera unos segundos y vuelve a intentarlo.';
    case 400:
      // Un usuario sin tenant (p. ej. el SUPER_ADMIN semilla) pasa el login
      // pero su JWT no trae el claim, el gateway no fija X-Tenant-Id y cada
      // microservicio de dominio responde esto. El mensaje crudo no le dice
      // nada al operador, asi que lo traducimos a algo que pueda accionar.
      if (fromBackend?.includes('X-Tenant-Id')) {
        return (
          'Tu usuario no esta asociado a ningun proveedor, y los datos de la plataforma ' +
          'siempre se consultan por proveedor. Asigna un tenant al usuario en dd_ms_auth ' +
          'o ingresa con uno que lo tenga.'
        );
      }
      return fromBackend ?? 'Los datos enviados no son validos.';
    case 401:
      // En el login un 401 son credenciales malas; dentro de la consola, un
      // token vencido. Confundirlos manda al operador a resolver otra cosa.
      return context === 'login'
        ? 'Correo o contrasena incorrectos.'
        : 'Tu sesion expiro. Vuelve a ingresar.';
    case 403:
      return (
        fromBackend ??
        'El modulo no esta activo para este proveedor. Actívalo en Módulos para usar esta sección.'
      );
    case 404:
      return fromBackend ?? 'No se encontro el recurso solicitado.';
    case 409:
      return fromBackend ?? 'El registro ya existe.';
    case 429:
      return fromBackend ?? 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.';
    case 502:
    case 503:
      return (
        fromBackend ??
        'Un servicio externo no respondio (MikroTik, OLT, WhatsApp o el proveedor de IA). Revisa sus credenciales.'
      );
    default:
      return fromBackend ?? `Error ${err.status} al llamar a la API.`;
  }
}
