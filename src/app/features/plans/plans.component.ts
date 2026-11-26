import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { CrmApi } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { Client, Plan, Technology } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { TablePagerComponent } from '../../shared/components/table-pager.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { cop, normalize } from '../../shared/format';
import { technologyLabel } from '../../shared/labels';
import { paginate } from '../../shared/pagination';

type PlanStatusFilter = 'ALL' | 'ACTIVE' | 'DISABLED';

/** Catalogo de planes por tecnologia con edicion, habilitacion y eliminacion. dd_ms_crm. */
@Component({
  selector: 'app-plans',
  imports: [
    ReactiveFormsModule,
    PageHeadComponent,
    AsyncStateComponent,
    ModalComponent,
    TablePagerComponent,
    RippleDirective,
  ],
  templateUrl: './plans.component.html',
})
export class PlansComponent {
  private readonly api = inject(CrmApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly plans = collection(() => this.api.plans(), [] as Plan[]);
  protected readonly clients = collection(
    () => this.api.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );

  protected readonly search = signal('');
  protected readonly statusFilter = signal<PlanStatusFilter>('ALL');
  protected readonly editing = signal<Plan | 'new' | null>(null);
  protected readonly saving = signal(false);
  protected readonly busyPlanId = signal<string | null>(null);
  protected readonly planEnabled = signal(true);

  protected readonly canManagePlans = computed(() => this.auth.role() === 'ADMIN_ISP');

  protected readonly statusOptions: { value: PlanStatusFilter; text: string }[] = [
    { value: 'ALL', text: 'Todos' },
    { value: 'ACTIVE', text: 'Activos' },
    { value: 'DISABLED', text: 'Deshabilitados' },
  ];

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
        enabled: plan.enabled !== false,
        label: technologyLabel(plan.technology),
        clients: clients.filter((c) => c.planId === plan.id).length,
      }))
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.clients - a.clients);
  });

  protected readonly filtered = computed(() => {
    const term = normalize(this.search());
    const status = this.statusFilter();
    return this.rows().filter((row) => {
      if (status === 'ACTIVE' && !row.enabled) return false;
      if (status === 'DISABLED' && row.enabled) return false;
      if (!term) return true;
      return [row.plan.name, row.label.text, String(row.plan.downMbps), String(row.plan.price)]
        .map((v) => normalize(v))
        .some((v) => v.includes(term));
    });
  });

  protected readonly pager = paginate(this.filtered, 9);

  protected readonly totals = computed(() => {
    const rows = this.rows();
    const active = rows.filter((r) => r.enabled).length;
    const assigned = rows.reduce((sum, r) => sum + r.clients, 0);
    const recurring = rows.reduce((sum, r) => sum + Number(r.plan.price ?? 0) * r.clients, 0);
    return { plans: rows.length, active, assigned, recurring };
  });

  protected openCreate(): void {
    this.form.reset({ name: '', downMbps: 100, upMbps: 50, technology: 'FIBRA', price: 79000 });
    this.planEnabled.set(true);
    this.editing.set('new');
  }

  protected openEdit(plan: Plan): void {
    this.form.reset({
      name: plan.name,
      downMbps: plan.downMbps,
      upMbps: plan.upMbps,
      technology: plan.technology,
      price: Number(plan.price),
    });
    this.planEnabled.set(plan.enabled !== false);
    this.editing.set(plan);
  }

  protected close(): void {
    this.editing.set(null);
  }

  protected save(): void {
    const target = this.editing();
    if (!target || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const request$ =
      target === 'new'
        ? this.api.createPlan(raw)
        : this.api.updatePlan(target.id, { ...raw, enabled: this.planEnabled() });

    request$.subscribe({
      next: (plan) => {
        this.saving.set(false);
        this.editing.set(null);
        this.toast.success(
          target === 'new' ? `Plan "${plan.name}" creado.` : `Plan "${plan.name}" actualizado.`,
        );
        this.plans.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected toggleStatus(plan: Plan): void {
    if (this.busyPlanId()) {
      return;
    }
    const nextEnabled = plan.enabled === false;
    this.busyPlanId.set(plan.id);
    this.api.updatePlanStatus(plan.id, nextEnabled).subscribe({
      next: (updated) => {
        this.busyPlanId.set(null);
        this.plans.update((all) => all.map((p) => (p.id === updated.id ? updated : p)));
        this.toast.success(
          nextEnabled ? `Plan "${plan.name}" habilitado.` : `Plan "${plan.name}" deshabilitado.`,
        );
      },
      error: (err: unknown) => {
        this.busyPlanId.set(null);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected deletePlan(plan: Plan): void {
    if (this.busyPlanId()) {
      return;
    }
    if (!confirm(`¿Eliminar el plan "${plan.name}"? Esta accion no se puede deshacer.`)) {
      return;
    }
    this.busyPlanId.set(plan.id);
    this.api.deletePlan(plan.id).subscribe({
      next: () => {
        this.busyPlanId.set(null);
        this.toast.success(`Plan "${plan.name}" eliminado.`);
        this.plans.reload();
      },
      error: (err: unknown) => {
        this.busyPlanId.set(null);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected readonly cop = cop;
}
