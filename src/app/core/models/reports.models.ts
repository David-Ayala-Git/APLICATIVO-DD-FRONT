/** Espejo del DTO de dd_ms_reports. */

export interface ExecutiveReport {
  /** Formato YYYY-MM. */
  period: string;
  mrr: number;
  arpu: number;
  /** Porcentaje (p. ej. 1.1 = 1.1%). */
  churnRate: number;
  activeClients: number;
  retiredClients: number;
  totalClients: number;
  generatedAt: string;
}
