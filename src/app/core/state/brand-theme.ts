import { Tenant } from '../models';

/** Los mismos defaults que auth.tenant (V1__init_auth.sql) y que styles/_tokens.scss. */
export const DEFAULT_BRAND_PRIMARY = '#6d28d9';
export const DEFAULT_BRAND_ACCENT = '#06b6d4';

const HEX = /^#[0-9a-f]{6}$/i;

/** Variables de _tokens.scss que dependen de la marca; se quitan para volver al tema base. */
const BRAND_VARS = [
  '--primary',
  '--primary-dark',
  '--primary-light',
  '--purple-light',
  '--brand-1',
  '--brand-2',
  '--accent',
  '--accent-dark',
  '--accent-light',
  '--grad-soft',
  '--shadow-brand',
] as const;

/**
 * Pinta la consola con los colores del proveedor (guia, seccion 11.3) sin
 * recompilar. Con los colores por defecto no toca nada: el tema base de
 * _tokens.scss tiene matices afinados a mano que una derivacion automatica no
 * reproduce exactamente. Los tonos oscuros/claros salen de color-mix().
 */
export function applyBrandTheme(tenant: Tenant | null): void {
  const style = document.documentElement.style;
  BRAND_VARS.forEach((name) => style.removeProperty(name));

  const primary = normalized(tenant?.brandPrimary, DEFAULT_BRAND_PRIMARY);
  const accent = normalized(tenant?.brandAccent, DEFAULT_BRAND_ACCENT);
  if (primary === DEFAULT_BRAND_PRIMARY && accent === DEFAULT_BRAND_ACCENT) {
    return;
  }

  style.setProperty('--primary', primary);
  style.setProperty('--primary-dark', `color-mix(in srgb, ${primary} 82%, black)`);
  style.setProperty('--primary-light', `color-mix(in srgb, ${primary} 12%, var(--surface))`);
  style.setProperty('--purple-light', `color-mix(in srgb, ${primary} 16%, var(--surface))`);
  style.setProperty('--brand-1', `color-mix(in srgb, ${primary} 88%, white)`);
  style.setProperty('--brand-2', accent);
  style.setProperty('--accent', accent);
  style.setProperty('--accent-dark', `color-mix(in srgb, ${accent} 78%, var(--text-primary))`);
  style.setProperty('--accent-light', `color-mix(in srgb, ${accent} 12%, var(--surface))`);
  style.setProperty(
    '--grad-soft',
    `linear-gradient(135deg, color-mix(in srgb, ${primary} 10%, transparent), color-mix(in srgb, ${accent} 10%, transparent))`,
  );
  style.setProperty('--shadow-brand', `0 18px 38px -16px color-mix(in srgb, ${primary} 45%, transparent)`);
}

/** Solo #RRGGBB: el valor llega de la base de datos y termina dentro de una regla CSS. */
function normalized(value: string | null | undefined, fallback: string): string {
  return value && HEX.test(value) ? value.toLowerCase() : fallback;
}
