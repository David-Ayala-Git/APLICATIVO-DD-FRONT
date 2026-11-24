import { Routes } from '@angular/router';

import { authGuard, guestGuard, pageGuard, superAdminMatch } from './core/auth/auth.guard';

/**
 * Cada pagina se carga bajo demanda. El `data` alimenta el titulo del topbar,
 * asi que la cabecera no se mantiene a mano en 19 sitios distintos.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Ingresar · D&D Conexiones',
    loadComponent: () => import('./layout/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    canActivateChild: [pageGuard],
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        // el SUPER_ADMIN no tiene tenant: su inicio es la consola de plataforma
        path: 'dashboard',
        canMatch: [superAdminMatch],
        data: { title: 'Consola de plataforma', subtitle: 'Proveedores, usuarios y modulos' },
        loadComponent: () =>
          import('./features/platform/platform-dashboard.component').then(
            (m) => m.PlatformDashboardComponent,
          ),
      },
      {
        path: 'dashboard',
        data: { title: 'Dashboard gerencial', subtitle: 'Resumen operativo del proveedor' },
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'crm',
        data: { title: 'CRM de clientes', subtitle: 'Base de clientes, servicios y estado' },
        loadComponent: () => import('./features/crm/crm.component').then((m) => m.CrmComponent),
      },
      {
        path: 'plans',
        data: { title: 'Planes de servicio', subtitle: 'Catalogo por tecnologia y velocidad' },
        loadComponent: () =>
          import('./features/plans/plans.component').then((m) => m.PlansComponent),
      },
      {
        path: 'mikrotik',
        data: {
          title: 'Gestion de MikroTik',
          subtitle: 'Routers, colas y cortes via RouterOS API',
        },
        loadComponent: () =>
          import('./features/mikrotik/mikrotik.component').then((m) => m.MikrotikComponent),
      },
      {
        path: 'gpon',
        data: { title: 'Gestion GPON', subtitle: 'OLT, ONU y potencias opticas' },
        loadComponent: () => import('./features/gpon/gpon.component').then((m) => m.GponComponent),
      },
      {
        path: 'coverage',
        data: { title: 'Cobertura y mapas', subtitle: 'Nodos, cajas NAP y torres' },
        loadComponent: () =>
          import('./features/coverage/coverage.component').then((m) => m.CoverageComponent),
      },
      {
        path: 'inventory',
        data: { title: 'Inventario', subtitle: 'Equipos, series y asignacion' },
        loadComponent: () =>
          import('./features/inventory/inventory.component').then((m) => m.InventoryComponent),
      },
      {
        path: 'billing',
        data: { title: 'Facturacion', subtitle: 'Corrida mensual y estado de cartera' },
        loadComponent: () =>
          import('./features/billing/billing.component').then((m) => m.BillingComponent),
      },
      {
        path: 'payments',
        data: { title: 'Pagos', subtitle: 'Recaudo por pasarela y conciliacion' },
        loadComponent: () =>
          import('./features/payments/payments.component').then((m) => m.PaymentsComponent),
      },
      {
        path: 'contracts',
        data: { title: 'Contratos y documentos', subtitle: 'Firma y expediente digital' },
        loadComponent: () =>
          import('./features/contracts/contracts.component').then((m) => m.ContractsComponent),
      },
      {
        path: 'tickets',
        data: { title: 'Mesa de ayuda', subtitle: 'Tickets con SLA y prioridad' },
        loadComponent: () =>
          import('./features/tickets/tickets.component').then((m) => m.TicketsComponent),
      },
      {
        path: 'technicians',
        data: { title: 'Gestion de tecnicos', subtitle: 'Cuadrilla y ordenes de trabajo' },
        loadComponent: () =>
          import('./features/technicians/technicians.component').then(
            (m) => m.TechniciansComponent,
          ),
      },
      {
        path: 'activations',
        data: { title: 'Activaciones', subtitle: 'Corte por mora y reactivacion' },
        loadComponent: () =>
          import('./features/activations/activations.component').then(
            (m) => m.ActivationsComponent,
          ),
      },
      {
        path: 'whatsapp',
        data: { title: 'WhatsApp Business', subtitle: 'Atencion y avisos por Cloud API' },
        loadComponent: () =>
          import('./features/whatsapp/whatsapp.component').then((m) => m.WhatsappComponent),
      },
      {
        path: 'ai',
        data: { title: 'Agentes de IA', subtitle: 'Asistentes de soporte, cartera y NOC' },
        loadComponent: () => import('./features/ai/ai.component').then((m) => m.AiComponent),
      },
      {
        path: 'automation',
        data: { title: 'Automatizacion', subtitle: 'Flujos entre modulos con n8n' },
        loadComponent: () =>
          import('./features/automation/automation.component').then((m) => m.AutomationComponent),
      },
      {
        path: 'reports',
        data: { title: 'Reportes ejecutivos', subtitle: 'MRR, ARPU, churn y recaudo' },
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'modules',
        data: { title: 'Modulos', subtitle: 'Activacion modular por proveedor' },
        loadComponent: () =>
          import('./features/modules/modules.component').then((m) => m.ModulesComponent),
      },
      {
        path: 'settings',
        data: { title: 'Configuracion', subtitle: 'Proveedor, integraciones y usuarios' },
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'app/dashboard' },
  { path: '**', redirectTo: 'app/dashboard' },
];
