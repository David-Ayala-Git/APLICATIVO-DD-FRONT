# dd_front — Consola de la plataforma ISP

Front en Angular 21 para el ecosistema de microservicios de D&D Conexiones.
Habla **solo** con el api-gateway (`/api/**`); nunca con un microservicio por su
puerto.

## Arrancar en desarrollo

```bash
# Conectado a la API desplegada en Render (https://aplicativo-dd.onrender.com)
cd dd_front
npm install          # .npmrc fija legacy-peer-deps (ver "Notas")
npm start            # http://localhost:4200

# O contra el ecosistema local en http://localhost:8080
npm run start:local
```

`proxy.conf.json` reenvia `/api` a `https://aplicativo-dd.onrender.com` (y
`proxy.conf.local.json` a `http://localhost:8080`), asi que en desarrollo el
navegador no hace peticiones cruzadas y CORS no entra en juego.

Para entrar necesitas un usuario en `auth.app_user`. Si la base esta vacia, crea
el primer tenant y su usuario contra la API:

```bash
# el gateway deja pasar /api/auth/login sin token, pero no /api/auth/tenants,
# asi que el primer tenant y el primer usuario se crean con el servicio directo
# o insertando en la base; despues ya se administra desde Configuracion.
```

## Compilar y desplegar

```bash
npm run build        # dist/dd_front/browser
```

En produccion se sirve con nginx, que ademas hace proxy de `/api` al gateway
(`nginx.conf`). Asi front y API quedan bajo el mismo origen:

```bash
docker compose up -d --build dd_front   # http://localhost:8081
```

Si prefieres servir la consola en otro origen, habilita los tuyos en
`CORS_ALLOWED_ORIGINS` (lo consume el `globalcors` del gateway).

## Como esta organizado

```
src/app/
  core/
    api/        un servicio por microservicio; API centraliza las rutas del gateway
    auth/       sesion (JWT en localStorage), interceptor y guards
    models/     espejo de los DTOs del backend
    state/      collection() — datos/carga/error en senales; latido de la plataforma
    ui/         toasts y traduccion de errores HTTP
  layout/
    login/      ingreso + fondo animado de fibra optica
    shell/      sidebar, topbar y outlet
  features/     una carpeta por pagina (19 en total)
  shared/       componentes, directivas, etiquetas de enums y formateos
styles/         tokens de marca, base, piezas reutilizables y pantallas
```

### Decisiones que conviene conocer

- **El tenant no se elige en el login.** Viene en el claim `tenantId` del JWT y
  el gateway reescribe `X-Tenant-Id` con ese valor, descartando lo que mande el
  cliente. Cambiar de proveedor implica volver a autenticarse. Por eso el
  selector de tenants del mockup se quedo como indicador, no como control.
- **`collection()`** (`core/state/collection.ts`) envuelve cada llamada en
  senales de datos/carga/error y la cancela al destruir el componente. Es
  deliberadamente pequeno: `resource()` sigue marcado como experimental en
  Angular 21.
- **Un modulo apagado responde 403.** Las pantallas de red, soporte y
  comunicaciones lo muestran como un aviso accionable ("activalo en Modulos")
  en lugar de un error crudo. El dashboard y el latido del menu ignoran esos
  403 a proposito para que una seccion apagada no tumbe la navegacion.
- **Sin datos inventados.** Donde el backend no expone un dato, la pantalla lo
  dice: Automatizacion documenta los flujos de n8n y sus endpoints en vez de
  fingir contadores de ejecuciones; Configuracion muestra el tenant en modo
  lectura porque `dd_ms_auth` todavia no tiene endpoint de actualizacion.

### Paginas y endpoints que consumen

| Pagina | Microservicio | Endpoints |
| --- | --- | --- |
| Dashboard | varios | agrega CRM, facturacion, red, soporte y reportes |
| CRM Clientes | crm | `GET/POST /api/crm/clients`, `PUT /api/crm/clients/{id}` |
| Planes | crm | `GET/POST /api/plans` |
| MikroTik | network | `GET/POST /api/network/routers`, `/{id}/cut`, `/{id}/enable`, `/{id}/queue` |
| GPON | network | `GET/POST /api/gpon/onu`, `/authorize/{id}`, `/{id}/signal` |
| Cobertura | network | `GET/POST /api/coverage/nodes` |
| Inventario | network | `GET/POST /api/inventory/equipment`, `/{id}/assign` |
| Facturacion | billing | `GET/POST /api/billing/invoices`, `POST /api/billing/run` |
| Pagos | billing | `GET /api/payments` (el alta llega por webhook) |
| Contratos | crm | `GET/POST /api/contracts`, `/{id}/sign` |
| Mesa de ayuda | support | `GET/POST /api/tickets`, `/{id}/assign`, `/resolve`, `/close` |
| Tecnicos | support | `/api/technicians`, `/{id}/status`, `/api/technicians/orders` |
| Activaciones | billing + network + crm | cartera vencida y corte/reactivacion en router |
| WhatsApp | comms | `GET /api/whatsapp`, `POST /api/whatsapp/send` |
| Agentes de IA | comms | `GET/POST /api/ai/agents`, `/{id}/chat` |
| Automatizacion | — | documenta los flujos; abre la consola de n8n |
| Reportes | reports | `/api/reports/executive`, `/refresh`, `/history` |
| Modulos | auth | `GET /api/auth/tenants`, `PUT .../modules/{key}` |
| Configuracion | auth (+ red, comms) | tenants, usuarios y estado de integraciones |

## Notas

- **`legacy-peer-deps`**: npm 10.9 falla al resolver los peers opcionales de
  vitest 4 (`Cannot read properties of null (reading 'edgesOut')`). `.npmrc` fija
  la bandera para que `npm install` y `npm ci` funcionen sin recordarla.
- **Fuentes e iconos** se cargan de Google Fonts y el CDN de Font Awesome, como
  en el mockup. Para un despliegue sin internet de salida, bajalos a `public/` y
  cambia los `<link>` de `src/index.html`.

## Despliegue en Vercel

Configurado en `vercel.json` (build de Angular, Node 22 por `engines`).

1. Vercel > **Add New > Project** > importar `David-Ayala-Git/APLICATIVO-DD`.
2. **Root Directory: `dd_front`** (el repo es un monorepo). Framework, comandos y
   carpeta de salida se toman de `vercel.json`; no hace falta tocarlos.
3. No necesita variables de entorno: la URL de la API no se configura en Vercel.

La consola llama a `/api/...` en su mismo dominio y Vercel lo reenvia al
gateway en Render (`rewrites` de `vercel.json`), asi no hay CORS. Si el
servicio de Render tiene otra URL que `https://aplicativo-dd.onrender.com`,
cambiala en `vercel.json` y vuelve a desplegar.
