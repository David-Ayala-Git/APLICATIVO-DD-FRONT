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
