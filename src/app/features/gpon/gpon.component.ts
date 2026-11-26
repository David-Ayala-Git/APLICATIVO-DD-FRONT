import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { CrmApi, NetworkApi } from '../../core/api';
import { Client, Onu, OnuStatus, OnuVendor } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { TablePagerComponent } from '../../shared/components/table-pager.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { normalize } from '../../shared/format';
import { onuStatusLabel, onuVendorLabel, rxPowerLabel } from '../../shared/labels';
import { paginate } from '../../shared/pagination';

type StatusFilter = OnuStatus | 'ALL';

/** GPON: inventario de ONUs, autorizacion y lectura de potencia optica. */
@Component({
  selector: 'app-gpon',
  imports: [
    ReactiveFormsModule,
    PageHeadComponent,
    StatCardComponent,
    StatusBadgeComponent,
    AsyncStateComponent,
    ModalComponent,
    TablePagerComponent,
    RippleDirective,
  ],
  templateUrl: './gpon.component.html',
})
export class GponComponent {
  private readonly api = inject(NetworkApi);
  private readonly crm = inject(CrmApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly onus = collection(() => this.api.onus(), [] as Onu[]);
  protected readonly clients = collection(
    () => this.crm.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );

  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('ALL');
  protected readonly onlyPending = signal(false);
  protected readonly registering = signal(false);
  protected readonly authorizing = signal<Onu | null>(null);
  protected readonly readingSignal = signal<Onu | null>(null);
  protected readonly saving = signal(false);

  protected readonly statusOptions: { value: StatusFilter; text: string }[] = [
    { value: 'ALL', text: 'Todas' },
    { value: 'ONLINE', text: 'En linea' },
    { value: 'LOS', text: 'LOS' },
    { value: 'UNAUTHORIZED', text: 'Sin autorizar' },
  ];

  protected readonly vendors: { value: OnuVendor; text: string }[] = [
    { value: 'HUAWEI', text: 'Huawei' },
    { value: 'ZTE', text: 'ZTE' },
    { value: 'OTHER', text: 'Otro fabricante' },
  ];

  protected readonly registerForm = this.fb.nonNullable.group({
    serial: ['', Validators.required],
    vendor: ['HUAWEI' as OnuVendor, Validators.required],
    oltName: ['', Validators.required],
    ponPort: ['', Validators.required],
  });

  protected readonly authorizeForm = this.fb.nonNullable.group({
    clientId: ['', Validators.required],
  });

  protected readonly signalForm = this.fb.nonNullable.group({
    rxPower: [-20, Validators.required],
  });

  protected readonly stats = computed(() => {
    const all = this.onus.value();
    return {
      olts: new Set(all.map((o) => o.oltName)).size,
      ponPorts: new Set(all.map((o) => `${o.oltName}|${o.ponPort}`)).size,
      online: all.filter((o) => o.status === 'ONLINE').length,
      total: all.length,
      los: all.filter((o) => o.status === 'LOS').length,
      pending: all.filter((o) => o.status === 'UNAUTHORIZED').length,
      lowSignal: all.filter((o) => o.rxPower !== null && o.rxPower < -27).length,
    };
  });

  protected readonly onlinePct = computed(() => {
    const { online, total } = this.stats();
    return total > 0 ? Math.round((online / total) * 100) : 0;
  });

  protected readonly filtered = computed(() => {
    const term = normalize(this.search());
    const pendingOnly = this.onlyPending();
    const status = this.statusFilter();
    return this.onus.value().filter((onu) => {
      if (pendingOnly && onu.status !== 'UNAUTHORIZED') {
        return false;
      }
      if (status !== 'ALL' && onu.status !== status) {
        return false;
      }
      if (!term) {
        return true;
      }
      const clientName = this.clientName(onu.clientId);
      return [onu.serial, onu.oltName, onu.ponPort, clientName]
        .map((v) => normalize(v))
        .some((v) => v.includes(term));
    });
  });

  protected readonly pager = paginate(this.filtered, 10);

  protected clientName(clientId: string | null): string {
    if (!clientId) {
      return 'Sin cliente';
    }
    return this.clients.value().find((c) => c.id === clientId)?.fullName ?? 'Cliente';
  }

  protected openRegister(): void {
    this.registerForm.reset({ serial: '', vendor: 'HUAWEI', oltName: '', ponPort: '' });
    this.registering.set(true);
  }

  protected openAuthorize(onu: Onu): void {
    this.authorizeForm.reset({ clientId: this.clients.value()[0]?.id ?? '' });
    this.authorizing.set(onu);
  }

  protected openSignal(onu: Onu): void {
    this.signalForm.reset({ rxPower: onu.rxPower ?? -20 });
    this.readingSignal.set(onu);
  }

  protected closeModals(): void {
    this.registering.set(false);
    this.authorizing.set(null);
    this.readingSignal.set(null);
  }

  protected register(): void {
    if (this.registerForm.invalid || this.saving()) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api.registerOnu(this.registerForm.getRawValue()).subscribe({
      next: (onu) => {
        this.saving.set(false);
        this.registering.set(false);
        this.toast.success(`ONU ${onu.serial} registrada como ${onu.status}.`);
        this.onus.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected authorize(): void {
    const onu = this.authorizing();
    if (!onu || this.authorizeForm.invalid || this.saving()) {
      this.authorizeForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api.authorizeOnu(onu.id, this.authorizeForm.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false);
        this.authorizing.set(null);
        this.toast.success('ONU autorizada y asociada al cliente.');
        this.onus.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected saveSignal(): void {
    const onu = this.readingSignal();
    if (!onu || this.signalForm.invalid || this.saving()) {
      this.signalForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api.updateSignal(onu.id, this.signalForm.getRawValue()).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.readingSignal.set(null);
        this.toast.success(`Potencia actualizada: ${updated.rxPower} dBm (${updated.status}).`);
        this.onus.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected readonly statusLabel = onuStatusLabel;
  protected readonly vendorLabel = onuVendorLabel;
  protected readonly rxLabel = rxPowerLabel;
}
