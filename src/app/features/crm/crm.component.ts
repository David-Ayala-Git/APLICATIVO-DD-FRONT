import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { catchError, of } from 'rxjs';

import { CrmApi, NetworkApi } from '../../core/api';
import { Client, ClientStatus, MikrotikRouter, Plan } from '../../core/models';
import { collection } from '../../core/state/collection';
import { ToastService } from '../../core/ui/toast.service';
import { describeHttpError } from '../../core/ui/http-error';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { initials, normalize } from '../../shared/format';
import { clientStatusLabel, technologyLabel } from '../../shared/labels';

type StatusFilter = ClientStatus | 'ALL';

/** CRM: listado de clientes con alta, edicion y filtros. dd_ms_crm. */
@Component({
  selector: 'app-crm',
  imports: [
    ReactiveFormsModule,
    PageHeadComponent,
    StatCardComponent,
    StatusBadgeComponent,
    AsyncStateComponent,
    ModalComponent,
    RippleDirective,
  ],
  templateUrl: './crm.component.html',
})
export class CrmComponent {
  private readonly api = inject(CrmApi);
  private readonly network = inject(NetworkApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly clients = collection(() => this.api.clients(), [] as Client[]);
  protected readonly plans = collection(() => this.api.plans(), [] as Plan[]);
  /** Vacio si el modulo de red esta apagado o el rol no lo ve: el routerId guardado se conserva igual. */
  protected readonly routers = collection(
    () => this.network.routers().pipe(catchError(() => of([] as MikrotikRouter[]))),
    [] as MikrotikRouter[],
  );

  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('ALL');
  protected readonly saving = signal(false);
  /** null = modal cerrado; un cliente = edicion; 'new' = alta. */
  protected readonly editing = signal<Client | 'new' | null>(null);

  protected readonly statusOptions: { value: StatusFilter; text: string }[] = [
    { value: 'ALL', text: 'Todos' },
    { value: 'ACTIVE', text: 'Activos' },
    { value: 'SUSPENDED', text: 'Suspendidos' },
    { value: 'RETIRED', text: 'Retirados' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', Validators.required],
    document: ['', Validators.required],
    phone: [''],
    address: [''],
    planId: [''],
    status: ['ACTIVE' as ClientStatus, Validators.required],
    ipAddress: [''],
    onuSerial: [''],
    routerId: [''],
    pppoeUser: [''],
  });

  protected readonly counts = computed(() => {
    const all = this.clients.value();
    return {
      total: all.length,
      active: all.filter((c) => c.status === 'ACTIVE').length,
      suspended: all.filter((c) => c.status === 'SUSPENDED').length,
      retired: all.filter((c) => c.status === 'RETIRED').length,
    };
  });

  protected readonly filtered = computed(() => {
    const term = normalize(this.search());
    const status = this.statusFilter();
    return this.clients.value().filter((c) => {
      if (status !== 'ALL' && c.status !== status) {
        return false;
      }
      if (!term) {
        return true;
      }
      return [c.fullName, c.document, c.ipAddress, c.onuSerial, c.address, c.phone]
        .map((v) => normalize(v))
        .some((v) => v.includes(term));
    });
  });

  protected planName(planId: string | null): string {
    return this.plans.value().find((p) => p.id === planId)?.name ?? 'Sin plan';
  }

  protected planBadge(planId: string | null) {
    const plan = this.plans.value().find((p) => p.id === planId);
    return technologyLabel(plan?.technology);
  }

  protected statusLabel = clientStatusLabel;
  protected initials = initials;

  protected openCreate(): void {
    this.form.reset({
      fullName: '',
      document: '',
      phone: '',
      address: '',
      planId: '',
      status: 'ACTIVE',
      ipAddress: '',
      onuSerial: '',
      routerId: '',
      pppoeUser: '',
    });
    this.form.controls.document.enable();
    this.editing.set('new');
  }

  protected openEdit(client: Client): void {
    this.form.reset({
      fullName: client.fullName,
      document: client.document,
      phone: client.phone ?? '',
      address: client.address ?? '',
      planId: client.planId ?? '',
      status: client.status,
      ipAddress: client.ipAddress ?? '',
      onuSerial: client.onuSerial ?? '',
      routerId: client.routerId ?? '',
      pppoeUser: client.pppoeUser ?? '',
    });
    // el documento es la identidad del cliente: no se cambia desde la edicion
    this.form.controls.document.disable();
    this.editing.set(client);
  }

  protected closeModal(): void {
    this.editing.set(null);
  }

  protected save(): void {
    const target = this.editing();
    if (!target || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const planId = raw.planId || null;
    this.saving.set(true);

    const request$ =
      target === 'new'
        ? this.api.createClient({
            fullName: raw.fullName,
            document: raw.document,
            phone: raw.phone || null,
            address: raw.address || null,
            planId,
          })
        : this.api.updateClient(target.id, {
            fullName: raw.fullName,
            phone: raw.phone || null,
            address: raw.address || null,
            planId,
            status: raw.status,
            ipAddress: raw.ipAddress || null,
            onuSerial: raw.onuSerial || null,
            routerId: raw.routerId || null,
            pppoeUser: raw.pppoeUser || null,
          });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(null);
        this.toast.success(
          target === 'new' ? 'Cliente creado.' : 'Cambios guardados en el cliente.',
        );
        this.clients.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }
}
