import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { BillingApi, CrmApi } from '../../core/api';
import { Client, Invoice, InvoiceStatus, Plan } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { cop, copCompact, currentPeriod, normalize, periodLabel } from '../../shared/format';
import { invoiceStatusLabel } from '../../shared/labels';

type StatusFilter = InvoiceStatus | 'ALL';

/** Facturacion: corrida masiva del periodo, factura manual y cartera. */
@Component({
  selector: 'app-billing',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PageHeadComponent,
    StatCardComponent,
    AsyncStateComponent,
    ModalComponent,
    RippleDirective,
  ],
  templateUrl: './billing.component.html',
})
export class BillingComponent {
  private readonly api = inject(BillingApi);
  private readonly crm = inject(CrmApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly invoices = collection(() => this.api.invoices(), [] as Invoice[]);
  protected readonly clients = collection(
    () => this.crm.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );
  protected readonly plans = collection(
    () => this.crm.plans().pipe(catchError(() => of([] as Plan[]))),
    [] as Plan[],
  );

  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('ALL');
  protected readonly periodFilter = signal<string>('ALL');
  protected readonly creating = signal(false);
  protected readonly confirmRun = signal(false);
  protected readonly saving = signal(false);
  protected readonly running = signal(false);

  protected readonly statusOptions: { value: StatusFilter; text: string }[] = [
    { value: 'ALL', text: 'Todas' },
    { value: 'PENDING', text: 'Pendientes' },
    { value: 'PAID', text: 'Pagadas' },
    { value: 'OVERDUE', text: 'Vencidas' },
    { value: 'CANCELLED', text: 'Anuladas' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    clientId: ['', Validators.required],
    planId: [''],
    period: [currentPeriod(), [Validators.required, Validators.pattern(/^\d{4}-\d{2}$/)]],
    amount: [0, [Validators.required, Validators.min(1)]],
    dueDate: [defaultDueDate(), Validators.required],
  });

  protected readonly stats = computed(() => {
    const all = this.invoices.value();
    const sum = (rows: Invoice[]) => rows.reduce((t, i) => t + Number(i.amount ?? 0), 0);
    const paid = all.filter((i) => i.status === 'PAID');
    const pending = all.filter((i) => i.status === 'PENDING');
    const overdue = all.filter((i) => i.status === 'OVERDUE');
    return {
      total: all.length,
      paid: paid.length,
      paidAmount: sum(paid),
      pending: pending.length,
      pendingAmount: sum(pending),
      overdue: overdue.length,
      overdueAmount: sum(overdue),
      /** Facturas ya timbradas ante la DIAN (tienen CUFE). */
      stamped: all.filter((i) => !!i.cufe).length,
    };
  });

  protected readonly periods = computed(() => {
    const unique = new Set(this.invoices.value().map((i) => i.period));
    return [...unique].sort().reverse();
  });

  protected readonly filtered = computed(() => {
    const term = normalize(this.search());
    const status = this.statusFilter();
    const period = this.periodFilter();
    return this.invoices
      .value()
      .filter((inv) => {
        if (status !== 'ALL' && inv.status !== status) {
          return false;
        }
        if (period !== 'ALL' && inv.period !== period) {
          return false;
        }
        if (!term) {
          return true;
        }
        return [this.clientName(inv.clientId), inv.period, inv.cufe]
          .map((v) => normalize(v))
          .some((v) => v.includes(term));
      })
      .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
  });

  protected clientName(clientId: string): string {
    return this.clients.value().find((c) => c.id === clientId)?.fullName ?? 'Cliente';
  }

  protected openCreate(): void {
    this.form.reset({
      clientId: this.clients.value()[0]?.id ?? '',
      planId: '',
      period: currentPeriod(),
      amount: 0,
      dueDate: defaultDueDate(),
    });
    this.creating.set(true);
  }

  /** Al elegir plan, precargamos su precio: es el caso normal. */
  protected onPlanChange(planId: string): void {
    const plan = this.plans.value().find((p) => p.id === planId);
    if (plan) {
      this.form.controls.amount.setValue(Number(plan.price));
    }
  }

  protected closeModals(): void {
    this.creating.set(false);
    this.confirmRun.set(false);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.api
      .createInvoice({
        clientId: raw.clientId,
        planId: raw.planId || null,
        period: raw.period,
        amount: raw.amount,
        dueDate: raw.dueDate,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.creating.set(false);
          this.toast.success('Factura emitida.');
          this.invoices.reload();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  /** Corrida mensual: el backend decide a quien facturar y que omitir. */
  protected runBilling(): void {
    if (this.running()) {
      return;
    }
    this.running.set(true);
    this.api.runBilling().subscribe({
      next: (result) => {
        this.running.set(false);
        this.confirmRun.set(false);
        this.toast.success(
          `Periodo ${result.period}: ${result.invoicesCreated} facturas creadas, ` +
            `${result.invoicesSkipped} omitidas de ${result.clientsEvaluated} clientes.`,
        );
        this.invoices.reload();
      },
      error: (err: unknown) => {
        this.running.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected readonly cop = cop;
  protected readonly copCompact = copCompact;
  protected readonly periodLabel = periodLabel;
  protected readonly statusLabel = invoiceStatusLabel;
  protected readonly currentPeriodValue = currentPeriod();
}

/** Vencimiento por defecto: 15 dias, el plazo habitual del sector. */
function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}
