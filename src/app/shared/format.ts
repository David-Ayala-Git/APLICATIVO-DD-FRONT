/** Formateos que se repiten en toda la consola. */

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** $120.000 — los ISP colombianos no manejan centavos en la factura mensual. */
export function cop(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : COP.format(value);
}

/** $38,4M para los tableros, donde no cabe la cifra completa. */
export function copCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1).replace('.', ',')}MM`;
  }
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
  }
  if (abs >= 1_000) {
    return `$${Math.round(value / 1_000)}k`;
  }
  return cop(value);
}

export function percent(value: number | null | undefined, decimals = 1): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(decimals)}%`;
}

/** Iniciales para los avatares de las tablas. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '··';
  }
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Periodo YYYY-MM en texto: "diciembre 2025". */
export function periodLabel(period: string | null | undefined): string {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return period ?? '—';
  }
  const [year, month] = period.split('-');
  const names = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${names[Number(month) - 1] ?? month} ${year}`;
}

/** Periodo actual en formato YYYY-MM, el que espera dd_ms_billing. */
export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Los ultimos n periodos, del mas antiguo al mas reciente. */
export function lastPeriods(count: number): string[] {
  const out: string[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Etiqueta corta de mes para los ejes del grafico: "dic". */
export function monthShort(period: string): string {
  const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const month = Number(period.split('-')[1]);
  return names[month - 1] ?? period;
}

/**
 * Tiempo que falta para el SLA, o cuanto lleva incumplido. Lo que mira el
 * coordinador de la mesa de ayuda antes de reasignar un ticket.
 */
export function slaCountdown(dueAt: string | null | undefined): {
  text: string;
  badge: 'badge-success' | 'badge-warning' | 'badge-danger' | 'badge-gray';
} {
  if (!dueAt) {
    return { text: 'Sin SLA', badge: 'badge-gray' };
  }
  const diffMs = new Date(dueAt).getTime() - Date.now();
  if (Number.isNaN(diffMs)) {
    return { text: 'Sin SLA', badge: 'badge-gray' };
  }

  const overdue = diffMs < 0;
  const totalMinutes = Math.floor(Math.abs(diffMs) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const span = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  if (overdue) {
    return { text: `Vencido ${span}`, badge: 'badge-danger' };
  }
  return { text: span, badge: hours < 2 ? 'badge-warning' : 'badge-success' };
}

/** Hora corta para el hilo de WhatsApp. */
export function timeShort(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

/** Normaliza texto para buscar sin tildes ni mayusculas. */
export function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
