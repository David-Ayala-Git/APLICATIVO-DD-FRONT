import { Tenant } from '../models';
import { canAccessPage, getRolePermissionSummary } from './access';

function tenantWith(...enabled: string[]): Tenant {
  return {
    id: 't-1',
    name: 'ISP de prueba',
    slug: 'isp-prueba',
    plan: 'TRIAL',
    status: 'ACTIVE',
    brandPrimary: null,
    brandAccent: null,
    createdAt: '2026-01-01T00:00:00Z',
    modules: enabled.map((moduleKey) => ({ moduleKey, enabled: true, config: null })),
  };
}

describe('canAccessPage', () => {
  const full = tenantWith('crm', 'billing', 'contracts', 'network', 'support', 'comms', 'reports', 'automation');

  it('deja ver dashboard y configuracion a cualquier sesion', () => {
    expect(canAccessPage('dashboard', 'TECNICO', null)).toBe(true);
    expect(canAccessPage('settings', 'OPERADOR', full)).toBe(true);
  });

  it('respeta el rol aunque el modulo este activo', () => {
    expect(canAccessPage('billing', 'TECNICO', full)).toBe(false);
    expect(canAccessPage('mikrotik', 'CARTERA', full)).toBe(false);
    expect(canAccessPage('reports', 'OPERADOR', full)).toBe(false);
    expect(canAccessPage('billing', 'CARTERA', full)).toBe(true);
  });

  it('oculta la pagina si el modulo esta apagado, aunque el rol sirva', () => {
    const noNetwork = tenantWith('crm', 'billing');
    expect(canAccessPage('gpon', 'ADMIN_ISP', noNetwork)).toBe(false);
    expect(canAccessPage('crm', 'ADMIN_ISP', noNetwork)).toBe(true);
  });

  it('un modulo deshabilitado explicitamente cuenta como apagado', () => {
    const t = tenantWith('crm');
    t.modules.push({ moduleKey: 'support', enabled: false, config: null });
    expect(canAccessPage('tickets', 'ADMIN_ISP', t)).toBe(false);
  });

  it('el Super Admin (sin tenant) no ve paginas de negocio pero si Modulos', () => {
    expect(canAccessPage('crm', 'SUPER_ADMIN', null)).toBe(false);
    expect(canAccessPage('billing', 'SUPER_ADMIN', null)).toBe(false);
    expect(canAccessPage('modules', 'SUPER_ADMIN', null)).toBe(true);
  });

  it('sin rol no se abre nada restringido', () => {
    expect(canAccessPage('crm', null, full)).toBe(false);
  });

  it('resume los modulos y permisos de cada rol base para los administradores', () => {
    const superAdmin = getRolePermissionSummary('SUPER_ADMIN', null);
    expect(superAdmin.pages.map((p) => p.path)).toEqual(['dashboard', 'modules', 'settings']);

    const tech = getRolePermissionSummary('TECNICO', full);
    expect(tech.pages.some((p) => p.path === 'gpon' && p.mode === 'full')).toBe(true);
    expect(tech.pages.some((p) => p.path === 'crm' && p.mode === 'read')).toBe(true);
    expect(tech.pages.some((p) => p.path === 'billing')).toBe(false);

    const cartera = getRolePermissionSummary('CARTERA', tenantWith('crm', 'billing'));
    expect(cartera.pages.find((p) => p.path === 'billing')?.moduleEnabled).toBe(true);
    expect(cartera.pages.find((p) => p.path === 'reports')?.moduleEnabled).toBe(false);
  });
});
