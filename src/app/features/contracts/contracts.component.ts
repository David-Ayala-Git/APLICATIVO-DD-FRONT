import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { CrmApi } from '../../core/api';
import { Client, Contract, Plan } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { contractStatusLabel } from '../../shared/labels';

/** Contratos del cliente y firma. dd_ms_crm. */
@Component({
  selector: 'app-contracts',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PageHeadComponent,
    StatCardComponent,
    StatusBadgeComponent,
    AsyncStateComponent,
    ModalComponent,
    RippleDirective,
  ],
  templateUrl: './contracts.component.html',
})
export class ContractsComponent {
  private readonly api = inject(CrmApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly contracts = collection(() => this.api.contracts(), [] as Contract[]);
  protected readonly clients = collection(
    () => this.api.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );
  protected readonly plans = collection(
    () => this.api.plans().pipe(catchError(() => of([] as Plan[]))),
    [] as Plan[],
  );

  protected readonly creating = signal(false);
  protected readonly saving = signal(false);
  protected readonly signingId = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    clientId: ['', Validators.required],
    planId: ['', Validators.required],
    documentUrl: [''],
  });

  protected readonly stats = computed(() => {
    const all = this.contracts.value();
    return {
      total: all.length,
      signed: all.filter((c) => c.status === 'SIGNED').length,
      draft: all.filter((c) => c.status === 'DRAFT').length,
      cancelled: all.filter((c) => c.status === 'CANCELLED').length,
    };
  });

  protected readonly rows = computed(() =>
    [...this.contracts.value()].sort((a, b) => {
      // primero lo que espera firma: es la cola de trabajo real
      const weight = (status: string) => (status === 'DRAFT' ? 0 : status === 'SIGNED' ? 1 : 2);
      const diff = weight(a.status) - weight(b.status);
      return diff !== 0 ? diff : a.createdAt < b.createdAt ? 1 : -1;
    }),
  );

  protected clientName(clientId: string): string {
    return this.clients.value().find((c) => c.id === clientId)?.fullName ?? 'Cliente';
  }

  protected planName(planId: string): string {
    return this.plans.value().find((p) => p.id === planId)?.name ?? 'Plan';
  }

  protected openCreate(): void {
    this.form.reset({
      clientId: this.clients.value()[0]?.id ?? '',
      planId: this.plans.value()[0]?.id ?? '',
      documentUrl: '',
    });
    this.creating.set(true);
  }

  protected close(): void {
    this.creating.set(false);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.api
      .createContract({
        clientId: raw.clientId,
        planId: raw.planId,
        documentUrl: raw.documentUrl || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.creating.set(false);
          this.toast.success('Contrato creado en borrador, listo para firma.');
          this.contracts.reload();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  protected sign(contract: Contract): void {
    if (this.signingId()) {
      return;
    }
    this.signingId.set(contract.id);
    this.api.signContract(contract.id).subscribe({
      next: () => {
        this.signingId.set(null);
        this.toast.success('Contrato marcado como firmado.');
        this.contracts.reload();
      },
      error: (err: unknown) => {
        this.signingId.set(null);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected readonly statusLabel = contractStatusLabel;
}
