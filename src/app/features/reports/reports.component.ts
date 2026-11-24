import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';

import { BillingApi, ReportsApi } from '../../core/api';
import { ExecutiveReport, Invoice } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { BarChartComponent, BarDatum } from '../../shared/components/bar-chart.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { cop, copCompact, monthShort, percent, periodLabel } from '../../shared/format';

/** Reportes ejecutivos: MRR, ARPU, churn y la serie historica. dd_ms_reports. */
@Component({
  selector: 'app-reports',
  imports: [
    DatePipe,
    PageHeadComponent,
    StatCardComponent,
    BarChartComponent,
    AsyncStateComponent,
    RippleDirective,
  ],
  templateUrl: './reports.component.html',
})
export class ReportsComponent {
  private readonly api = inject(ReportsApi);
  private readonly billing = inject(BillingApi);
  private readonly toast = inject(ToastService);

  protected readonly current = collection(
    () => this.api.current(),
    null as ExecutiveReport | null,
  );
  protected readonly history = collection(() => this.api.history(), [] as ExecutiveReport[]);
  protected readonly invoices = collection(
    () => this.billing.invoices().pipe(catchError(() => of([] as Invoice[]))),
    [] as Invoice[],
  );

  protected readonly refreshing = signal(false);

  /** Historial de mas antiguo a mas reciente, que es como se lee una serie. */
  protected readonly ordered = computed(() =>
    [...this.history.value()].sort((a, b) => (a.period > b.period ? 1 : -1)),
  );

  protected readonly clientBars = computed<BarDatum[]>(() =>
    this.ordered().map((r) => ({
      label: monthShort(r.period),
      value: r.activeClients,
      display: String(r.activeClients),
    })),
  );

  protected readonly mrrBars = computed<BarDatum[]>(() =>
    this.ordered().map((r) => ({
      label: monthShort(r.period),
      value: Number(r.mrr ?? 0),
      display: copCompact(Number(r.mrr ?? 0)),
    })),
  );

  /** Variacion del MRR contra el periodo anterior del historico. */
  protected readonly mrrTrend = computed(() => {
    const rows = this.ordered();
    if (rows.length < 2) {
      return null;
    }
    const last = Number(rows[rows.length - 1].mrr ?? 0);
    const prev = Number(rows[rows.length - 2].mrr ?? 0);
    if (prev === 0) {
      return null;
    }
    return ((last - prev) / prev) * 100;
  });

  /**
   * Efectividad de recaudo del periodo del reporte: pagado sobre facturado.
   * Se calcula aqui porque el DTO del backend no la trae.
   */
  protected readonly collectionRate = computed(() => {
    const period = this.current.value()?.period;
    if (!period) {
      return null;
    }
    const rows = this.invoices.value().filter((i) => i.period === period);
    const billed = rows.reduce((t, i) => t + Number(i.amount ?? 0), 0);
    if (billed === 0) {
      return null;
    }
    const paid = rows
      .filter((i) => i.status === 'PAID')
      .reduce((t, i) => t + Number(i.amount ?? 0), 0);
    return (paid / billed) * 100;
  });

  protected refresh(): void {
    if (this.refreshing()) {
      return;
    }
    this.refreshing.set(true);
    this.api.refresh().subscribe({
      next: (report) => {
        this.refreshing.set(false);
        this.current.set(report);
        this.history.reload();
        this.invoices.reload();
        this.toast.success(`Reporte del periodo ${report.period} recalculado.`);
      },
      error: (err: unknown) => {
        this.refreshing.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected readonly cop = cop;
  protected readonly copCompact = copCompact;
  protected readonly percent = percent;
  protected readonly periodLabel = periodLabel;
}
