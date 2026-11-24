import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { CrmApi } from '../../core/api';
import { Client, Plan, Technology } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { cop } from '../../shared/format';
import { technologyLabel } from '../../shared/labels';

/** Catalogo de planes por tecnologia. dd_ms_crm. */
@Component({
  selector: 'app-plans',
  imports: [
    ReactiveFormsModule,
    PageHeadComponent,
    AsyncStateComponent,
    ModalComponent,
    RippleDirective,
  ],
  templateUrl: './plans.component.html',
})
export class PlansComponent {
  private readonly api = inject(CrmApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly plans = collection(() => this.api.plans(), [] as Plan[]);
  protected readonly clients = collection(
    () => this.api.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );

  protected readonly creating = signal(false);
  protected readonly saving = signal(false);

  protected readonly technologies: { value: Technology; text: string }[] = [
    { value: 'FIBRA', text: 'Fibra optica (GPON)' },
    { value: 'CABLE', text: 'Cable UTP' },
    { value: 'ANTENA', text: 'Antena / inalambrico' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    downMbps: [100, [Validators.required, Validators.min(1)]],
    upMbps: [50, [Validators.required, Validators.min(1)]],
    technology: ['FIBRA' as Technology, Validators.required],
    price: [79000, [Validators.required, Validators.min(1)]],
  });

  /** Cada plan con el numero de clientes que lo tienen asignado. */
  protected readonly rows = computed(() => {
    const clients = this.clients.value();
    return this.plans
      .value()
      .map((plan) => ({
        plan,
        label: technologyLabel(plan.technology),
        clients: clients.filter((c) => c.planId === plan.id).length,
      }))
      .sort((a, b) => b.clients - a.clients);
  });

  protected readonly totals = computed(() => {
    const rows = this.rows();
    const assigned = rows.reduce((sum, r) => sum + r.clients, 0);
    const recurring = rows.reduce((sum, r) => sum + Number(r.plan.price ?? 0) * r.clients, 0);
    return { plans: rows.length, assigned, recurring };
  });

  protected openCreate(): void {
    this.form.reset({ name: '', downMbps: 100, upMbps: 50, technology: 'FIBRA', price: 79000 });
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
    this.saving.set(true);
    this.api.createPlan(this.form.getRawValue()).subscribe({
      next: (plan) => {
        this.saving.set(false);
        this.creating.set(false);
        this.toast.success(`Plan "${plan.name}" creado.`);
        this.plans.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected readonly cop = cop;
}
