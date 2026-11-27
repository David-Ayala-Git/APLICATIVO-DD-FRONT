import { Tenant } from '../models';

export type AppThemeMode = 'light' | 'dark';

export interface SidebarColors {
  darkBg: string;
  darkText: string;
  lightBg: string;
  lightText: string;
  indicator: string;
}

/** Colores originales del sidebar D&D (azul marino profundo en oscuro y blanco limpio en claro). */
export const DEFAULT_SIDEBAR_COLORS: SidebarColors = {
  darkBg: '#0b1020',
  darkText: '#c7cde0',
  lightBg: '#ffffff',
  lightText: '#374151',
  indicator: '#7c3aed',
};

const HEX = /^#[0-9a-f]{6}$/i;
const STORAGE_PREFIX = 'dd_sidebar_colors:';
const APP_THEME_KEY = 'dd_app_theme';

const SIDEBAR_COLOR_VARS = [
  '--sb-custom-dark-bg',
  '--sb-custom-dark-bg-2',
  '--sb-custom-dark-text',
  '--sb-custom-light-bg',
  '--sb-custom-light-text',
  '--sb-custom-indicator',
] as const;

function storageKey(tenantSlug: string | null | undefined): string {
  return `${STORAGE_PREFIX}${tenantSlug || 'default'}`;
}

function validHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fallback;
}

export function sanitizeSidebarColors(input: Partial<SidebarColors> | null | undefined): SidebarColors {
  return {
    darkBg: validHex(input?.darkBg, DEFAULT_SIDEBAR_COLORS.darkBg),
    darkText: validHex(input?.darkText, DEFAULT_SIDEBAR_COLORS.darkText),
    lightBg: validHex(input?.lightBg, DEFAULT_SIDEBAR_COLORS.lightBg),
    lightText: validHex(input?.lightText, DEFAULT_SIDEBAR_COLORS.lightText),
    indicator: validHex(input?.indicator, DEFAULT_SIDEBAR_COLORS.indicator),
  };
}

/**
 * Lee los colores del sidebar guardados en el backend dentro de
 * `tenant_module.config.sidebarColors`. Devuelve null si el proveedor usa
 * los colores por defecto.
 */
export function extractTenantSidebarColors(tenant: Tenant | null | undefined): SidebarColors | null {
  if (!tenant?.modules?.length) {
    return null;
  }
  for (const mod of tenant.modules) {
    const raw = mod.config?.['sidebarColors'];
    if (raw && typeof raw === 'object') {
      return sanitizeSidebarColors(raw as Partial<SidebarColors>);
    }
  }
  return null;
}

/**
 * Elige el modulo del tenant donde se guarda `config.sidebarColors` en el backend
 * (conservando intactas todas las demas claves de `config`).
 */
export function pickSidebarConfigModule(tenant: Tenant | null | undefined) {
  if (!tenant?.modules?.length) {
    return null;
  }
  return (
    tenant.modules.find((m) => m.config?.['sidebarColors'] !== undefined) ??
    tenant.modules.find((m) => m.moduleKey === 'crm') ??
    tenant.modules[0] ??
    null
  );
}

export function loadSidebarColors(
  tenantSlug: string | null | undefined,
  tenant?: Tenant | null,
): SidebarColors {
  const fromBackend = extractTenantSidebarColors(tenant);
  if (fromBackend) {
    cacheSidebarColors(tenantSlug, fromBackend);
    return fromBackend;
  }
  try {
    const raw = localStorage.getItem(storageKey(tenantSlug));
    if (!raw) {
      return { ...DEFAULT_SIDEBAR_COLORS };
    }
    return sanitizeSidebarColors(JSON.parse(raw) as Partial<SidebarColors>);
  } catch {
    return { ...DEFAULT_SIDEBAR_COLORS };
  }
}

export function cacheSidebarColors(
  tenantSlug: string | null | undefined,
  colors: SidebarColors,
): SidebarColors {
  const clean = sanitizeSidebarColors(colors);
  try {
    localStorage.setItem(storageKey(tenantSlug), JSON.stringify(clean));
  } catch {
    // Almacenamiento local no disponible
  }
  return clean;
}

export function saveSidebarColors(
  tenantSlug: string | null | undefined,
  colors: SidebarColors,
): SidebarColors {
  const clean = cacheSidebarColors(tenantSlug, colors);
  applySidebarColors(clean);
  return clean;
}

export function resetSidebarColors(tenantSlug: string | null | undefined): SidebarColors {
  try {
    localStorage.removeItem(storageKey(tenantSlug));
  } catch {
    // Almacenamiento local no disponible
  }
  applySidebarColors(null);
  return { ...DEFAULT_SIDEBAR_COLORS };
}

export function applySidebarColors(colors: SidebarColors | null): void {
  const style = document.documentElement.style;
  SIDEBAR_COLOR_VARS.forEach((name) => style.removeProperty(name));

  if (!colors) {
    return;
  }

  const clean = sanitizeSidebarColors(colors);

  if (clean.darkBg !== DEFAULT_SIDEBAR_COLORS.darkBg) {
    style.setProperty('--sb-custom-dark-bg', clean.darkBg);
    style.setProperty('--sb-custom-dark-bg-2', `color-mix(in srgb, ${clean.darkBg} 92%, white)`);
  }
  if (clean.darkText !== DEFAULT_SIDEBAR_COLORS.darkText) {
    style.setProperty('--sb-custom-dark-text', clean.darkText);
  }
  if (clean.lightBg !== DEFAULT_SIDEBAR_COLORS.lightBg) {
    style.setProperty('--sb-custom-light-bg', clean.lightBg);
  }
  if (clean.lightText !== DEFAULT_SIDEBAR_COLORS.lightText) {
    style.setProperty('--sb-custom-light-text', clean.lightText);
  }
  if (clean.indicator !== DEFAULT_SIDEBAR_COLORS.indicator) {
    style.setProperty('--sb-custom-indicator', clean.indicator);
  }
}

/** Modo claro / oscuro global de toda la aplicacion. */
export function loadAppTheme(): AppThemeMode {
  try {
    const saved = localStorage.getItem(APP_THEME_KEY) ?? localStorage.getItem('dd_sidebar_theme');
    return saved === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyAppTheme(mode: AppThemeMode): void {
  document.documentElement.setAttribute('data-theme', mode);
  try {
    localStorage.setItem(APP_THEME_KEY, mode);
    localStorage.setItem('dd_sidebar_theme', mode);
  } catch {
    // Almacenamiento local no disponible
  }
}
