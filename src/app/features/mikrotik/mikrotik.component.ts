import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { NetworkApi } from '../../core/api';
import { MikrotikRouter, ROUTEROS_ID_PATTERN, RouterStatus } from '../../core/models';
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
import { routerStatusLabel } from '../../shared/labels';
import { paginate } from '../../shared/pagination';

type Action = 'cut' | 'enable' | 'queue';
type StatusFilter = RouterStatus | 'ALL';

/**
 * Routers MikroTik y operaciones sobre un cliente via RouterOS API.
 * El backend cifra la contrasena del router con NETWORK_CRYPTO_SECRET y no la
 * devuelve nunca, por eso la pantalla no la muestra ni permite releerla.
 */
@Component({
  selector: 'app-mikrotik',
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
  templateUrl: './mikrotik.component.html',
})
export class MikrotikComponent {
  private readonly api = inject(NetworkApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly routers = collection(() => this.api.routers(), [] as MikrotikRouter[]);

  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('ALL');
  protected readonly addingRouter = signal(false);
  protected readonly action = signal<Action | null>(null);
  protected readonly saving = signal(false);

  protected readonly statusOptions: { value: StatusFilter; text: string }[] = [
    { value: 'ALL', text: 'Todos' },
    { value: 'ONLINE', text: 'En linea' },
    { value: 'OFFLINE', text: 'Fuera de linea' },
    { value: 'ERROR', text: 'Error' },
  ];

  protected readonly filteredRouters = computed(() => {
    const term = normalize(this.search());
    const status = this.statusFilter();
    return this.routers.value().filter((r) => {
      if (status !== 'ALL' && r.status !== status) {
        return false;
      }
      if (!term) {
        return true;
      }
      return [r.name, r.host, r.apiUser, r.model]
        .map((v) => normalize(v))
        .some((v) => v.includes(term));
    });
  });

  protected readonly pager = paginate(this.filteredRouters, 10);

  protected readonly routerForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    host: ['', Validators.required],
    apiPort: [8728, [Validators.required, Validators.min(1)]],
    apiUser: ['', Validators.required],
    apiPassword: ['', Validators.required],
    model: [''],
  });

  protected readonly actionForm = this.fb.nonNullable.group({
    routerId: ['', Validators.required],
    secretId: ['', Validators.required],
    queueId: [''],
    downloadKbps: [100000],
    uploadKbps: [50000],
  });

  protected readonly stats = computed(() => {
    const all = this.routers.value();
    return {
      total: all.length,
      online: all.filter((r) => r.status === 'ONLINE').length,
      offline: all.filter((r) => r.status === 'OFFLINE').length,
      error: all.filter((r) => r.status === 'ERROR').length,
    };
  });

  protected readonly actionTitle = computed(() => {
    switch (this.action()) {
      case 'cut':
        return 'Cortar cliente por mora';
      case 'enable':
        return 'Reactivar cliente';
      case 'queue':
        return 'Cambiar velocidad (simple queue)';
      default:
        return '';
    }
  });

  protected readonly statusLabel = routerStatusLabel;

  protected openAddRouter(): void {
    this.routerForm.reset({
      name: '',
      host: '',
      apiPort: 8728,
      apiUser: '',
      apiPassword: '',
      model: '',
    });
    this.addingRouter.set(true);
  }

  protected openAction(action: Action): void {
    const first = this.routers.value()[0];
    this.actionForm.reset({
      routerId: first?.id ?? '',
      secretId: '',
      queueId: '',
      downloadKbps: 100000,
      uploadKbps: 50000,
    });
    this.applyQueueValidators(action === 'queue');
    this.action.set(action);
  }

  protected closeModals(): void {
    this.addingRouter.set(false);
    this.action.set(null);
  }

  protected saveRouter(): void {
    if (this.routerForm.invalid || this.saving()) {
      this.routerForm.markAllAsTouched();
      return;
    }
    const raw = this.routerForm.getRawValue();
    this.saving.set(true);
    this.api
      .createRouter({
        name: raw.name,
        host: raw.host,
        apiPort: raw.apiPort,
        apiUser: raw.apiUser,
        apiPassword: raw.apiPassword,
        model: raw.model || null,
      })
      .subscribe({
        next: (router) => {
          this.saving.set(false);
          this.addingRouter.set(false);
          this.toast.success(`Router ${router.name} vinculado (${router.status}).`);
          this.routers.reload();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  protected runAction(): void {
    const action = this.action();
    if (!action || this.actionForm.invalid || this.saving()) {
      this.actionForm.markAllAsTouched();
      return;
    }

    const raw = this.actionForm.getRawValue();
    this.saving.set(true);

    const done = (message: string) => {
      this.saving.set(false);
      this.action.set(null);
      this.toast.success(message);
      this.routers.reload();
    };
    const fail = (err: unknown) => {
      this.saving.set(false);
      this.toast.error(describeHttpError(err));
    };

    if (action === 'queue') {
      this.api
        .setQueueLimit(raw.routerId, {
          queueId: raw.queueId,
          downloadKbps: raw.downloadKbps,
          uploadKbps: raw.uploadKbps,
        })
        .subscribe({
          next: () => done('Nueva velocidad aplicada en el router.'),
          error: fail,
        });
      return;
    }

    const body = { secretId: raw.secretId };
    const request$ =
      action === 'cut'
        ? this.api.cutClient(raw.routerId, body)
        : this.api.enableClient(raw.routerId, body);

    request$.subscribe({
      next: () =>
        done(action === 'cut' ? 'Cliente cortado en el router.' : 'Cliente reactivado en el router.'),
      error: fail,
    });
  }

  /** El queue necesita identificador propio; el corte solo usa el secret. */
  private applyQueueValidators(isQueue: boolean): void {
    const { queueId, secretId, downloadKbps, uploadKbps } = this.actionForm.controls;
    if (isQueue) {
      queueId.setValidators([Validators.required, Validators.pattern(ROUTEROS_ID_PATTERN)]);
      downloadKbps.setValidators([Validators.required, Validators.min(1)]);
      uploadKbps.setValidators([Validators.required, Validators.min(1)]);
      secretId.clearValidators();
    } else {
      queueId.clearValidators();
      downloadKbps.clearValidators();
      uploadKbps.clearValidators();
      secretId.setValidators([Validators.required, Validators.pattern(ROUTEROS_ID_PATTERN)]);
    }
    queueId.updateValueAndValidity();
    secretId.updateValueAndValidity();
    downloadKbps.updateValueAndValidity();
    uploadKbps.updateValueAndValidity();
  }
}
