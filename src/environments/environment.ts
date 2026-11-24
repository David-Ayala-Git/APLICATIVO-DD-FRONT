/**
 * Desarrollo: las llamadas salen como rutas relativas (/api/...) y el dev-server
 * de Angular las reenvia a https://aplicativo-dd.onrender.com segun proxy.conf.json
 * (o a localhost:8080 con `npm run start:local`). Asi no hace falta CORS.
 */
export const environment = {
  production: false,
  /** Prefijo de la API. Vacio = mismo origen (proxy del dev-server). */
  apiBaseUrl: '',
  /** Consola de n8n, enlazada desde la pagina de Automatizacion. */
  n8nUrl: 'http://localhost:5678',
};
