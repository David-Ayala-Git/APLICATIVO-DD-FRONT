import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { BillingApi, CrmApi, NetworkApi } from '../../core/api';
import { Client, Invoice, MikrotikRouter, ROUTEROS_ID_PATTERN } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { cop, copCompact } from '../../shared/format';

interface DebtRow {
  client: Client;
  invoices: Invoice[];
  amount: number;
  /** Dias desde el vencimiento mas antiguo sin pagar. */
  daysOverdue: number;
}

/**
 * Activaciones: une la cartera de dd_ms_billing con el corte en red de
 * dd_ms_network. Son dos acciones distintas a proposito — suspender en el CRM
 * deja constancia administrativa, cortar en el router quita el servicio — y la
 * pantalla deja claro cual se esta ejecutando.
 */
@Component({
  selector: 'app-activations',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    PageHeadComponent,
    StatCardComponent,
    AsyncStateComponent,
    ModalComponent,
    RippleDirective,
  ],
  templateUrl: './activations.component.html',
})
export class ActivationsComponent {
  private readonly billing = inject(BillingApi);
  private readonly crm = inject(CrmApi);
  private readonly network = inject(NetworkApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly invoices = collection(() => this.billing.invoices(), [] as Invoice[]);
  protected readonly clients = collection(() => this.crm.clients(), [] as Client[]);
  protected readonly routers = collection(
    () => this.network.routers().pipe(catchError(() => of([] as MikrotikRouter[]))),
    [] as MikrotikRouter[],
  );

  /** Accion en curso: corte o reactivacion sobre un cliente concreto. */
  protected readonly networkAction = signal<{ mode: 'cut' | 'enable'; client: Client } | null>(null);
  protected readonly saving = signal(false);
  protected readonly busyId = signal<string | null>(null);

  protected readonly actionForm = this.fb.nonNullable.group({
    routerId: ['', Validators.required],
    secretId: ['', [Validators.required, Validators.pattern(ROUTEROS_ID_PATTERN)]],
  });

  protected readonly stats = computed(() => {
    const clients = this.clients.value();
    return {
      active: clients.filter((c) => c.status === 'ACTIVE').length,
      suspended: clients.filter((c) => c.status === 'SUSPENDED').length,
      inArrears: this.debtors().length,
      arrearsAmount: this.debtors().reduce((t, row) => t + row.amount, 0),
    };
  });

  /** Clientes con al menos una factura vencida, del mas atrasado al menos. */
  protected readonly debtors = computed<DebtRow[]>(() => {
    const overdue = this.invoices.value().filter((i) => i.status === 'OVERDUE');
    const byClient = new Map<string, Invoice[]>();
    for (const invoice of overdue) {
      byClient.set(invoice.clientId, [...(byClient.get(invoice.clientId) ?? []), invoice]);
    }

    const rows: DebtRow[] = [];
    for (const client of this.clients.value()) {
      const invoices = byClient.get(client.id);
      if (!invoices || invoices.length === 0) {
        continue;
      }
      const oldest = invoices
        .map((i) => new Date(i.dueDate).getTime())
        .reduce((min, t) => Math.min(min, t), Number.MAX_SAFE_INTEGER);
      rows.push({
        client,
        invoices,
        amount: invoices.reduce((t, i) => t + Number(i.amount ?? 0), 0),
        daysOverdue: Math.max(0, Math.floor((Date.now() - oldest) / 86_400_000)),
      });
    }
    return rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
  });

  /** Suspendidos que ya no tienen facturas vencidas: candidatos a reactivar. */
  protected readonly readyToRestore = computed(() => {
    const debtorIds = new Set(this.debtors().map((d) => d.client.id));
    return this.clients.value().filter((c) => c.status === 'SUSPENDED' && !debtorIds.has(c.id));
  });

  protected openNetworkAction(mode: 'cut' | 'enable', client: Client): void {
    this.actionForm.reset({
      // el router y el usuario PPPoE vinculados al cliente mandan; si no hay, se sugiere
      // el primer router y el documento (muchos ISP nombran asi el secret)
      routerId: client.routerId ?? this.routers.value()[0]?.id ?? '',
      secretId: client.pppoeUser ?? client.document,
    });
    this.networkAction.set({ mode, client });
  }

  protected closeModal(): void {
    this.networkAction.set(null);
  }

  protected runNetworkAction(): void {
    const action = this.networkAction();
    if (!action || this.actionForm.invalid || this.saving()) {
      this.actionForm.markAllAsTouched();
      return;
    }
    const raw = this.actionForm.getRawValue();
    this.saving.set(true);

    const request$ =
      action.mode === 'cut'
        ? this.network.cutClient(raw.routerId, { secretId: raw.secretId })
        : this.network.enableClient(raw.routerId, { secretId: raw.secretId });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.networkAction.set(null);
        this.toast.success(
          action.mode === 'cut'
            ? `Servicio cortado en el router para ${action.client.fullName}.`
            : `Servicio restablecido en el router para ${action.client.fullName}.`,
        );
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  /** Cambia el estado administrativo en el CRM, sin tocar la red. */
  protected setCrmStatus(client: Client, status: 'ACTIVE' | 'SUSPENDED'): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(client.id);
    this.crm
      .updateClient(client.id, {
        fullName: client.fullName,
        phone: client.phone,
        address: client.address,
        planId: client.planId,
        status,
        ipAddress: client.ipAddress,
        onuSerial: client.onuSerial,
      })
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.toast.success(
            status === 'SUSPENDED'
              ? 'Cliente marcado como suspendido en el CRM.'
              : 'Cliente marcado como activo en el CRM.',
          );
          this.clients.reload();
        },
        error: (err: unknown) => {
          this.busyId.set(null);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  protected reloadAll(): void {
    this.invoices.reload();
    this.clients.reload();
    this.routers.reload();
  }

  protected readonly cop = cop;
  protected readonly copCompact = copCompact;
}
