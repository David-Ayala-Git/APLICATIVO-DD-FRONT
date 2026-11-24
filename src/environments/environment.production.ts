/**
 * Produccion: las llamadas salen como rutas relativas (/api/...) y Vercel las
 * reenvia a https://aplicativo-dd.onrender.com/api/:path* mediante vercel.json
 * (sin CORS). Si se despliega sin proxy/rewrite, fija apiBaseUrl a la URL de
 * Render y habilita el origen en CORS_ALLOWED_ORIGINS.
 */
export const environment = {
  production: true,
  apiBaseUrl: '',
  // n8n no se publica (docker-compose: 127.0.0.1:5678); se abre con un tunel SSH:
  //   ssh -L 5678:localhost:5678 usuario@servidor
  n8nUrl: 'http://localhost:5678',
};
