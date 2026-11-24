import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { BillingApi, CrmApi } from '../../core/api';
import { Client, Invoice, Payment, PaymentMethod } from '../../core/models';
import { collection } from '../../core/state/collection';
import { TenantService } from '../../core/state/tenant.service';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { cop, copCompact, initials, normalize, percent } from '../../shared/format';
import { invoiceStatusLabel, paymentMethodLabel, paymentStatusLabel } from '../../shared/labels';

const METHODS: PaymentMethod[] = ['MANUAL', 'PSE', 'WOMPI', 'NEQUI'];

/** Metodos que se pueden registrar a mano desde la consola. Wompi y PSE se
 *  dejan exclusivamente para su webhook real: no se ofrecen aqui. */
const MANUAL_METHODS: { value: PaymentMethod; text: string; placeholder: string }[] = [
  {
    value: 'MANUAL',
    text: 'Efectivo / pago manual',
    placeholder: 'Recibo de caja N.o 1045',
  },
  {
    value: 'NEQUI',
    text: 'Nequi (manual)',
    placeholder: 'Numero de comprobante Nequi',
  },
];

interface PayableInvoice {
  invoice: Invoice;
  client: Client;
}

/**
 * Pagos recibidos y conciliacion, mas el registro manual de un pago (efectivo
 * o Nequi confirmado a mano) por POST /api/payments/manual. Las pasarelas
 * (Wompi/PSE) confirman por su propio webhook firmado, que no se usa desde aqui.
 */
@Component({
  selector: 'app-payments',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PageHeadComponent,
    StatCardComponent,
    AsyncStateComponent,
    ModalComponent,
    RippleDirective,
  ],
  templateUrl: './payments.component.html',
})
export class PaymentsComponent {
  private readonly api = inject(BillingApi);
  private readonly crm = inject(CrmApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly tenantService = inject(TenantService);

  /** Apagable desde Modulos -> Facturacion y pagos -> "Registrar pago manual". */
  protected readonly manualPaymentsEnabled = this.tenantService.featureEnabled(
    'billing',
    'manualPayments',
  );

  protected readonly payments = collection(() => this.api.payments(), [] as Payment[]);
  protected readonly invoices = collection(
    () => this.api.invoices().pipe(catchError(() => of([] as Invoice[]))),
    [] as Invoice[],
  );
  protected readonly clients = collection(
    () => this.crm.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );

  protected readonly manualMethods = MANUAL_METHODS;

  protected readonly registering = signal(false);
  protected readonly selectedInvoiceId = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly saving = signal(false);

  protected readonly manualForm = this.fb.nonNullable.group({
    method: ['MANUAL' as PaymentMethod, Validators.required],
    amount: [0, [Validators.required, Validators.min(1)]],
    externalReference: ['', Validators.required],
  });

  /**
   * Espejo en senal del metodo elegido. `computed()` solo se invalida cuando
   * lee una senal: el valor de un FormControl no lo es, asi que sin esto el
   * placeholder de "Referencia" se quedaria pegado en el primer metodo
   * elegido. La sincroniza el (change) del select en el template.
   */
  protected readonly methodValue = signal<PaymentMethod>('MANUAL');

  protected readonly stats = computed(() => {
    const all = this.payments.value();
    const confirmed = all.filter((p) => p.status === 'CONFIRMED');
    return {
      total: all.length,
      confirmed: confirmed.length,
      confirmedAmount: confirmed.reduce((t, p) => t + Number(p.amount ?? 0), 0),
      pending: all.filter((p) => p.status === 'PENDING').length,
      failed: all.filter((p) => p.status === 'FAILED').length,
    };
  });

  /** Reparto del recaudo confirmado por medio de pago. */
  protected readonly byMethod = computed(() => {
    const confirmed = this.payments.value().filter((p) => p.status === 'CONFIRMED');
    const total = confirmed.reduce((t, p) => t + Number(p.amount ?? 0), 0);
    return METHODS.map((method) => {
      const rows = confirmed.filter((p) => p.method === method);
      const amount = rows.reduce((t, p) => t + Number(p.amount ?? 0), 0);
      return {
        method,
        label: paymentMethodLabel(method),
        count: rows.length,
        amount,
        share: total > 0 ? (amount / total) * 100 : 0,
      };
    }).sort((a, b) => b.amount - a.amount);
  });

  protected readonly recent = computed(() =>
    [...this.payments.value()].sort((a, b) => ((a.paidAt ?? '') < (b.paidAt ?? '') ? 1 : -1)),
  );

  /**
   * Clientes con una factura PENDIENTE u OVERDUE: el universo de "disponibles
   * para este periodo, pendientes de pagar" que puede recibir un pago manual.
   * Las PAID y CANCELLED quedan fuera porque el backend ya no las deja volver
   * a procesar (InvoiceValidator.validateNotPaid).
   */
  protected readonly payable = computed<PayableInvoice[]>(() => {
    const clientsById = new Map(this.clients.value().map((c) => [c.id, c]));
    return this.invoices
      .value()
      .filter((inv) => inv.status === 'PENDING' || inv.status === 'OVERDUE')
      .map((invoice) => {
        const client = clientsById.get(invoice.clientId);
        return client ? { invoice, client } : null;
      })
      .filter((row): row is PayableInvoice => row !== null)
      .sort((a, b) => {
        // primero lo mas vencido, luego lo mas proximo a vencer
        if (a.invoice.status !== b.invoice.status) {
          return a.invoice.status === 'OVERDUE' ? -1 : 1;
        }
        return a.invoice.dueDate < b.invoice.dueDate ? -1 : 1;
      });
  });

  protected readonly filteredPayable = computed(() => {
    const term = normalize(this.search());
    if (!term) {
      return this.payable();
    }
    return this.payable().filter((row) =>
      [row.client.fullName, row.client.document, row.invoice.period]
        .map((v) => normalize(v))
        .some((v) => v.includes(term)),
    );
  });

  protected readonly selected = computed<PayableInvoice | null>(() => {
    const id = this.selectedInvoiceId();
    return this.payable().find((row) => row.invoice.id === id) ?? null;
  });

  protected readonly selectedMethod = computed(
    () => this.manualMethods.find((m) => m.value === this.methodValue())!,
  );

  /** Cliente del pago, resuelto a traves de la factura asociada. */
  protected clientOf(payment: Payment): string {
    const invoice = this.invoices.value().find((i) => i.id === payment.invoiceId);
    if (!invoice) {
      return 'Factura no encontrada';
    }
    return this.clients.value().find((c) => c.id === invoice.clientId)?.fullName ?? 'Cliente';
  }

  protected periodOf(payment: Payment): string {
    return this.invoices.value().find((i) => i.id === payment.invoiceId)?.period ?? '—';
  }

  protected openRegister(): void {
    this.search.set('');
    this.selectedInvoiceId.set(null);
    this.methodValue.set('MANUAL');
    this.manualForm.reset({ method: 'MANUAL', amount: 0, externalReference: '' });
    this.registering.set(true);
  }

  protected onMethodChange(method: PaymentMethod): void {
    this.methodValue.set(method);
  }

  protected selectInvoice(row: PayableInvoice): void {
    this.selectedInvoiceId.set(row.invoice.id);
    this.manualForm.controls.amount.setValue(Number(row.invoice.amount));
  }

  protected close(): void {
    this.registering.set(false);
  }

  protected confirmPayment(): void {
    const row = this.selected();
    if (!row || this.manualForm.invalid || this.saving()) {
      this.manualForm.markAllAsTouched();
      return;
    }
    const raw = this.manualForm.getRawValue();
    this.saving.set(true);

    this.api
      .registerPayment({
        invoiceId: row.invoice.id,
        amount: raw.amount,
        method: raw.method,
        externalReference: raw.externalReference,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.registering.set(false);
          this.toast.success(
            `Pago de ${row.client.fullName} registrado. La factura ${row.invoice.period} quedo pagada.`,
          );
          this.payments.reload();
          this.invoices.reload();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  protected reloadAll(): void {
    this.payments.reload();
    this.invoices.reload();
    this.clients.reload();
  }

  protected readonly cop = cop;
  protected readonly copCompact = copCompact;
  protected readonly percent = percent;
  protected readonly initials = initials;
  protected readonly methodLabel = paymentMethodLabel;
  protected readonly statusLabel = paymentStatusLabel;
  protected readonly invoiceLabel = invoiceStatusLabel;
}
