import { Tenant } from '../models';
import { DEFAULT_BRAND_ACCENT, DEFAULT_BRAND_PRIMARY, applyBrandTheme } from './brand-theme';

function tenant(brandPrimary: string | null, brandAccent: string | null): Tenant {
  return {
    id: 't-1',
    name: 'ISP',
    slug: 'isp',
    plan: 'TRIAL',
    status: 'ACTIVE',
    brandPrimary,
    brandAccent,
    createdAt: '2026-01-01T00:00:00Z',
    modules: [],
  };
}

const css = (name: string) => document.documentElement.style.getPropertyValue(name);

describe('applyBrandTheme', () => {
  afterEach(() => applyBrandTheme(null));

  it('con los colores por defecto no toca el tema base', () => {
    applyBrandTheme(tenant(DEFAULT_BRAND_PRIMARY, DEFAULT_BRAND_ACCENT));
    expect(css('--primary')).toBe('');
    expect(css('--accent')).toBe('');
  });

  it('aplica los colores del proveedor y deriva los tonos', () => {
    applyBrandTheme(tenant('#E11D48', '#0EA5E9'));
    expect(css('--primary')).toBe('#e11d48');
    expect(css('--accent')).toBe('#0ea5e9');
    expect(css('--brand-2')).toBe('#0ea5e9');
    expect(css('--primary-dark')).toContain('color-mix');
  });

  it('ignora valores que no son #RRGGBB (vienen de la base de datos)', () => {
    applyBrandTheme(tenant('red;} body {display:none', DEFAULT_BRAND_ACCENT));
    expect(css('--primary')).toBe('');
  });

  it('al cerrar sesion vuelve al tema base', () => {
    applyBrandTheme(tenant('#e11d48', '#0ea5e9'));
    applyBrandTheme(null);
    expect(css('--primary')).toBe('');
    expect(css('--grad-soft')).toBe('');
  });
});
