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

export function loadSidebarColors(tenantSlug: string | null | undefined): SidebarColors {
  try {
    const raw = localStorage.getItem(storageKey(tenantSlug));
    if (!raw) {
      return { ...DEFAULT_SIDEBAR_COLORS };
    }
    const parsed = JSON.parse(raw) as Partial<SidebarColors>;
    return {
      darkBg: validHex(parsed.darkBg, DEFAULT_SIDEBAR_COLORS.darkBg),
      darkText: validHex(parsed.darkText, DEFAULT_SIDEBAR_COLORS.darkText),
      lightBg: validHex(parsed.lightBg, DEFAULT_SIDEBAR_COLORS.lightBg),
      lightText: validHex(parsed.lightText, DEFAULT_SIDEBAR_COLORS.lightText),
      indicator: validHex(parsed.indicator, DEFAULT_SIDEBAR_COLORS.indicator),
    };
  } catch {
    return { ...DEFAULT_SIDEBAR_COLORS };
  }
}

export function saveSidebarColors(
  tenantSlug: string | null | undefined,
  colors: SidebarColors,
): SidebarColors {
  const clean: SidebarColors = {
    darkBg: validHex(colors.darkBg, DEFAULT_SIDEBAR_COLORS.darkBg),
    darkText: validHex(colors.darkText, DEFAULT_SIDEBAR_COLORS.darkText),
    lightBg: validHex(colors.lightBg, DEFAULT_SIDEBAR_COLORS.lightBg),
    lightText: validHex(colors.lightText, DEFAULT_SIDEBAR_COLORS.lightText),
    indicator: validHex(colors.indicator, DEFAULT_SIDEBAR_COLORS.indicator),
  };
  try {
    localStorage.setItem(storageKey(tenantSlug), JSON.stringify(clean));
  } catch {
    // Almacenamiento local no disponible
  }
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

  const darkBg = validHex(colors.darkBg, DEFAULT_SIDEBAR_COLORS.darkBg);
  const darkText = validHex(colors.darkText, DEFAULT_SIDEBAR_COLORS.darkText);
  const lightBg = validHex(colors.lightBg, DEFAULT_SIDEBAR_COLORS.lightBg);
  const lightText = validHex(colors.lightText, DEFAULT_SIDEBAR_COLORS.lightText);
  const indicator = validHex(colors.indicator, DEFAULT_SIDEBAR_COLORS.indicator);

  if (darkBg !== DEFAULT_SIDEBAR_COLORS.darkBg) {
    style.setProperty('--sb-custom-dark-bg', darkBg);
    style.setProperty('--sb-custom-dark-bg-2', `color-mix(in srgb, ${darkBg} 92%, white)`);
  }
  if (darkText !== DEFAULT_SIDEBAR_COLORS.darkText) {
    style.setProperty('--sb-custom-dark-text', darkText);
  }
  if (lightBg !== DEFAULT_SIDEBAR_COLORS.lightBg) {
    style.setProperty('--sb-custom-light-bg', lightBg);
  }
  if (lightText !== DEFAULT_SIDEBAR_COLORS.lightText) {
    style.setProperty('--sb-custom-light-text', lightText);
  }
  if (indicator !== DEFAULT_SIDEBAR_COLORS.indicator) {
    style.setProperty('--sb-custom-indicator', indicator);
  }
}
