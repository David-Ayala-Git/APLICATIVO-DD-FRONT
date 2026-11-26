import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { BillingApi, CrmApi, NetworkApi, ReportsApi, SupportApi } from '../../core/api';
import {
  Client,
  ExecutiveReport,
  Invoice,
  MikrotikRouter,
  Onu,
  Plan,
  Ticket,
} from '../../core/models';
import { collection } from '../../core/state/collection';
import { BarChartComponent, BarDatum } from '../../shared/components/bar-chart.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { TablePagerComponent } from '../../shared/components/table-pager.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { copCompact, cop, lastPeriods, monthShort, normalize, percent } from '../../shared/format';
import { priorityLabel, technologyLabel, ticketStatusLabel } from '../../shared/labels';
import { paginate } from '../../shared/pagination';

/**
 * Tablero gerencial. Cruza CRM, facturacion, red y soporte en una sola vista;
 * cada consulta falla en silencio para que un modulo apagado (403 del gateway)
 * no tumbe el resto del tablero.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    DatePipe,
    RouterLink,
    StatCardComponent,
    StatusBadgeComponent,
    BarChartComponent,
    TablePagerComponent,
    RippleDirective,
  ],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private readonly crm = inject(CrmApi);
  private readonly billing = inject(BillingApi);
  private readonly network = inject(NetworkApi);
  private readonly support = inject(SupportApi);
  private readonly reports = inject(ReportsApi);

  protected readonly clients = collection(
    () => this.crm.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );
  protected readonly plans = collection(
    () => this.crm.plans().pipe(catchError(() => of([] as Plan[]))),
    [] as Plan[],
  );
  protected readonly invoices = collection(
    () => this.billing.invoices().pipe(catchError(() => of([] as Invoice[]))),
    [] as Invoice[],
  );
  protected readonly routers = collection(
    () => this.network.routers().pipe(catchError(() => of([] as MikrotikRouter[]))),
    [] as MikrotikRouter[],
  );
  protected readonly onus = collection(
    () => this.network.onus().pipe(catchError(() => of([] as Onu[]))),
    [] as Onu[],
  );
  protected readonly tickets = collection(
    () => this.support.tickets().pipe(catchError(() => of([] as Ticket[]))),
    [] as Ticket[],
  );
  protected readonly report = collection(
    () => this.reports.current().pipe(catchError(() => of(null))),
    null as ExecutiveReport | null,
  );

  protected readonly loading = computed(
    () => this.clients.loading() || this.invoices.loading() || this.report.loading(),
  );

  // ---------- Metricas de cabecera ----------

  protected readonly clientStats = computed(() => {
    const all = this.clients.value();
    const active = all.filter((c) => c.status === 'ACTIVE').length;
    return {
      total: all.length,
      active,
      suspended: all.filter((c) => c.status === 'SUSPENDED').length,
      activeShare: all.length > 0 ? (active / all.length) * 100 : 0,
    };
  });

  /** Recaudo del periodo en curso = facturas pagadas del mes mas reciente. */
  protected readonly monthRevenue = computed(() => {
    const period = lastPeriods(1)[0];
    return this.invoices
      .value()
      .filter((i) => i.period === period && i.status === 'PAID')
      .reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
  });

  protected readonly overdue = computed(() => {
    const rows = this.invoices.value().filter((i) => i.status === 'OVERDUE');
    return {
      count: rows.length,
      amount: rows.reduce((sum, i) => sum + Number(i.amount ?? 0), 0),
    };
  });

  // ---------- Grafico de recaudo ----------

  protected readonly revenueBars = computed<BarDatum[]>(() => {
    const invoices = this.invoices.value();
    return lastPeriods(12).map((period) => {
      const paid = invoices
        .filter((i) => i.period === period && i.status === 'PAID')
        .reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
      return { label: monthShort(period), value: paid, display: copCompact(paid) };
    });
  });

  protected readonly hasRevenueData = computed(() =>
    this.revenueBars().some((bar) => bar.value > 0),
  );

  // ---------- Salud de la red ----------

  protected readonly networkStats = computed(() => {
    const routers = this.routers.value();
    const onus = this.onus.value();
    return {
      routersOnline: routers.filter((r) => r.status === 'ONLINE').length,
      routersTotal: routers.length,
      onusOnline: onus.filter((o) => o.status === 'ONLINE').length,
      onusTotal: onus.length,
      onusLos: onus.filter((o) => o.status === 'LOS').length,
      onusPending: onus.filter((o) => o.status === 'UNAUTHORIZED').length,
      olts: new Set(onus.map((o) => o.oltName)).size,
      ponPorts: new Set(onus.map((o) => `${o.oltName}|${o.ponPort}`)).size,
    };
  });

  protected readonly onuHealthPct = computed(() => {
    const { onusOnline, onusTotal } = this.networkStats();
    return onusTotal > 0 ? Math.round((onusOnline / onusTotal) * 100) : 0;
  });

  // ---------- Distribucion por plan ----------

  protected readonly planDistribution = computed(() => {
    const clients = this.clients.value();
    return this.plans
      .value()
      .map((plan) => ({
        plan,
        badge: technologyLabel(plan.technology).badge,
        count: clients.filter((c) => c.planId === plan.id).length,
      }))
      .sort((a, b) => b.count - a.count);
  });

  protected readonly unassignedClients = computed(
    () => this.clients.value().filter((c) => !c.planId).length,
  );

  // ---------- Tickets ----------

  protected readonly ticketSearch = signal('');

  protected readonly openTickets = computed(() => {
    const term = normalize(this.ticketSearch());
    return this.tickets
      .value()
      .filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS')
      .filter((t) =>
        !term
          ? true
          : [t.reason, this.clientName(t.clientId)].map((v) => normalize(v)).some((v) => v.includes(term)),
      )
      .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));
  });

  protected readonly ticketsPager = paginate(this.openTickets, 5);

  protected readonly urgentCount = computed(
    () => this.tickets.value().filter((t) => t.priority === 'URGENT' && t.status !== 'CLOSED').length,
  );

  protected clientName(clientId: string): string {
    return this.clients.value().find((c) => c.id === clientId)?.fullName ?? 'Cliente';
  }

  protected reloadAll(): void {
    this.clients.reload();
    this.plans.reload();
    this.invoices.reload();
    this.routers.reload();
    this.onus.reload();
    this.tickets.reload();
    this.report.reload();
  }

  protected readonly cop = cop;
  protected readonly copCompact = copCompact;
  protected readonly percent = percent;
  protected readonly priorityLabel = priorityLabel;
  protected readonly ticketStatusLabel = ticketStatusLabel;
}

function priorityWeight(priority: string): number {
  return { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[priority] ?? 0;
}
