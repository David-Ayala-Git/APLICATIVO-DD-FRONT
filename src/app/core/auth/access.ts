import { Role, Tenant } from '../models';

/**
 * Quien puede abrir cada pagina de /app/*: el modulo que debe estar activo en
 * el tenant y los roles que la usan. Es espejo de los @RequiresModule y
 * @RequiresRole de lectura en los microservicios - el backend es la frontera
 * real; esto solo evita mostrar pantallas que igual responderian 403.
 * Una pagina sin entrada (dashboard, settings) la ve cualquier sesion.
 */
interface PageAccess {
  module?: string;
  roles?: Role[];
}

const PAGE_ACCESS: Record<string, PageAccess> = {
  crm: { module: 'crm', roles: ['ADMIN_ISP', 'OPERADOR', 'CARTERA', 'TECNICO'] },
  plans: { module: 'crm', roles: ['ADMIN_ISP', 'OPERADOR', 'CARTERA'] },
  mikrotik: { module: 'network', roles: ['ADMIN_ISP', 'OPERADOR', 'TECNICO'] },
  gpon: { module: 'network', roles: ['ADMIN_ISP', 'OPERADOR', 'TECNICO'] },
  coverage: { module: 'network', roles: ['ADMIN_ISP', 'OPERADOR', 'TECNICO'] },
  inventory: { module: 'network', roles: ['ADMIN_ISP', 'OPERADOR', 'TECNICO'] },
  billing: { module: 'billing', roles: ['ADMIN_ISP', 'CARTERA', 'OPERADOR'] },
  payments: { module: 'billing', roles: ['ADMIN_ISP', 'CARTERA', 'OPERADOR'] },
  contracts: { module: 'contracts', roles: ['ADMIN_ISP', 'OPERADOR', 'CARTERA'] },
  tickets: { module: 'support', roles: ['ADMIN_ISP', 'OPERADOR', 'TECNICO', 'CARTERA'] },
  technicians: { module: 'support', roles: ['ADMIN_ISP', 'OPERADOR', 'TECNICO'] },
  // corte y reactivacion pegan a dd_ms_network (RouterController.cut/enable)
  activations: { module: 'network', roles: ['ADMIN_ISP', 'OPERADOR', 'CARTERA'] },
  whatsapp: { module: 'comms', roles: ['ADMIN_ISP', 'OPERADOR', 'CARTERA'] },
  ai: { module: 'comms', roles: ['ADMIN_ISP', 'OPERADOR', 'CARTERA'] },
  automation: { module: 'automation', roles: ['ADMIN_ISP'] },
  reports: { module: 'reports', roles: ['ADMIN_ISP', 'CARTERA'] },
  modules: { roles: ['SUPER_ADMIN', 'ADMIN_ISP'] },
};

export function canAccessPage(path: string, role: Role | null, tenant: Tenant | null): boolean {
  const access = PAGE_ACCESS[path];
  if (!access) {
    return true;
  }
  if (access.roles && (!role || !access.roles.includes(role))) {
    return false;
  }
  if (access.module) {
    return tenant?.modules.some((m) => m.moduleKey === access.module && m.enabled) ?? false;
  }
  return true;
}

export type RoleAccessMode = 'full' | 'partial' | 'read';

export interface RolePagePermission {
  path: string;
  label: string;
  icon: string;
  module: string | null;
  mode: RoleAccessMode;
  modeLabel: string;
  /** true si el modulo esta activo en el proveedor actual (o no depende de modulo). */
  moduleEnabled: boolean;
}

export interface RolePermissionSummary {
  role: Role;
  summary: string;
  canWrite: string;
  restrictions: string;
  pages: RolePagePermission[];
}

interface PageMeta {
  path: string;
  label: string;
  icon: string;
}

const PAGE_ORDER: PageMeta[] = [
  { path: 'dashboard', label: 'Dashboard', icon: 'fas fa-gauge-high' },
  { path: 'crm', label: 'CRM Clientes', icon: 'fas fa-users' },
  { path: 'plans', label: 'Planes', icon: 'fas fa-layer-group' },
  { path: 'mikrotik', label: 'MikroTik', icon: 'fas fa-network-wired' },
  { path: 'gpon', label: 'GPON · OLT/ONU', icon: 'fas fa-satellite-dish' },
  { path: 'coverage', label: 'Cobertura', icon: 'fas fa-map-marked-alt' },
  { path: 'inventory', label: 'Inventario', icon: 'fas fa-boxes-stacked' },
  { path: 'billing', label: 'Facturacion', icon: 'fas fa-file-invoice-dollar' },
  { path: 'payments', label: 'Pagos', icon: 'fas fa-credit-card' },
  { path: 'contracts', label: 'Contratos', icon: 'fas fa-file-signature' },
  { path: 'tickets', label: 'Mesa de ayuda', icon: 'fas fa-headset' },
  { path: 'technicians', label: 'Tecnicos', icon: 'fas fa-user-gear' },
  { path: 'activations', label: 'Activaciones', icon: 'fas fa-toggle-on' },
  { path: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp' },
  { path: 'ai', label: 'Agentes de IA', icon: 'fas fa-robot' },
  { path: 'automation', label: 'Automatizacion', icon: 'fas fa-diagram-project' },
  { path: 'reports', label: 'Reportes', icon: 'fas fa-chart-line' },
  { path: 'modules', label: 'Modulos', icon: 'fas fa-cubes' },
  { path: 'settings', label: 'Configuracion', icon: 'fas fa-sliders' },
];

interface RoleGuide {
  summary: string;
  canWrite: string;
  restrictions: string;
  modes: Partial<Record<string, { mode: RoleAccessMode; label: string }>>;
}

/**
 * Resumen operativo de los 5 roles base, alineado con @RequiresRole en los
 * microservicios. Se muestra a SUPER_ADMIN y ADMIN_ISP en Configuracion.
 */
const ROLE_GUIDES: Record<Role, RoleGuide> = {
  SUPER_ADMIN: {
    summary: 'Dueno de la plataforma (sin proveedor asociado): administra todos los ISP.',
    canWrite: 'Crear proveedores, activar/desactivar modulos, crear usuarios (incluidos Super Admin) y roles personalizados.',
    restrictions: 'No accede a pantallas operativas de un ISP concreto (CRM, red, finanzas, soporte o reportes).',
    modes: {
      dashboard: { mode: 'full', label: 'Consola plataforma' },
      modules: { mode: 'full', label: 'Todos los ISP' },
      settings: { mode: 'full', label: 'Todos los ISP' },
    },
  },
  ADMIN_ISP: {
    summary: 'Control total sobre todos los modulos activos de su proveedor.',
    canWrite: 'Gestion completa: clientes, planes, routers, GPON, facturacion, pagos, tecnicos, IA, reportes, branding, modulos y usuarios de su ISP.',
    restrictions: 'Solo administra su propio proveedor y no puede crear usuarios Super Admin.',
    modes: {},
  },
  OPERADOR: {
    summary: 'Operacion diaria de clientes, red, soporte y atencion al usuario.',
    canWrite: 'Clientes, contratos, GPON, cobertura, inventario, cortes/colas MikroTik, tickets, ordenes de trabajo, WhatsApp y chat IA.',
    restrictions: 'Solo lectura en Planes, Facturacion y Pagos. No crea planes, routers, tecnicos ni agentes IA; sin acceso a Automatizacion, Reportes ni Modulos.',
    modes: {
      plans: { mode: 'read', label: 'Solo lectura' },
      billing: { mode: 'read', label: 'Solo lectura' },
      payments: { mode: 'read', label: 'Solo lectura' },
      mikrotik: { mode: 'partial', label: 'Cortes y colas' },
      technicians: { mode: 'partial', label: 'Ordenes y estado' },
      ai: { mode: 'partial', label: 'Solo chat' },
      settings: { mode: 'read', label: 'Solo lectura' },
    },
  },
  CARTERA: {
    summary: 'Gestion financiera, facturacion, recaudo y control de mora.',
    canWrite: 'Facturacion completa (crear, vencidas, corrida), pagos manuales, suspender/reactivar clientes, cortes en Activaciones, tickets (crear), WhatsApp y chat IA.',
    restrictions: 'Solo lectura en Clientes (ficha), Planes, Contratos y Reportes. Sin acceso a MikroTik, GPON, Cobertura, Inventario, Tecnicos, Automatizacion ni Modulos.',
    modes: {
      crm: { mode: 'partial', label: 'Ver y estado mora' },
      plans: { mode: 'read', label: 'Solo lectura' },
      contracts: { mode: 'read', label: 'Solo lectura' },
      tickets: { mode: 'partial', label: 'Ver y crear' },
      activations: { mode: 'partial', label: 'Corte y reactivacion' },
      ai: { mode: 'partial', label: 'Solo chat' },
      reports: { mode: 'read', label: 'Solo lectura' },
      settings: { mode: 'read', label: 'Solo lectura' },
    },
  },
  TECNICO: {
    summary: 'Operacion de campo, red GPON, inventario asignado y resolucion de fallas.',
    canWrite: 'GPON completo (alta, autorizacion, senal), asignar equipos de inventario, crear/resolver tickets, actualizar su estado y completar ordenes de trabajo.',
    restrictions: 'Solo lectura en Clientes, MikroTik y Cobertura. Sin acceso a Planes, Finanzas, Activaciones, WhatsApp, IA, Automatizacion, Reportes ni Modulos.',
    modes: {
      crm: { mode: 'read', label: 'Solo lectura' },
      mikrotik: { mode: 'read', label: 'Solo lectura' },
      coverage: { mode: 'read', label: 'Solo lectura' },
      inventory: { mode: 'partial', label: 'Ver y asignar' },
      tickets: { mode: 'partial', label: 'Crear y resolver' },
      technicians: { mode: 'partial', label: 'Estado y ordenes' },
      settings: { mode: 'read', label: 'Solo lectura' },
    },
  },
};

export function getRolePermissionSummary(role: Role, tenant: Tenant | null): RolePermissionSummary {
  const guide = ROLE_GUIDES[role];
  const pages: RolePagePermission[] = [];

  for (const meta of PAGE_ORDER) {
    const rule = PAGE_ACCESS[meta.path];
    if (rule?.roles && !rule.roles.includes(role)) {
      continue;
    }
    const moduleKey = rule?.module ?? null;
    const moduleEnabled =
      !moduleKey || !tenant
        ? true
        : tenant.modules.some((m) => m.moduleKey === moduleKey && m.enabled);
    const customMode = guide.modes[meta.path];
    pages.push({
      path: meta.path,
      label: meta.label,
      icon: meta.icon,
      module: moduleKey,
      mode: customMode?.mode ?? 'full',
      modeLabel: customMode?.label ?? 'Completo',
      moduleEnabled,
    });
  }

  return {
    role,
    summary: guide.summary,
    canWrite: guide.canWrite,
    restrictions: guide.restrictions,
    pages,
  };
}
