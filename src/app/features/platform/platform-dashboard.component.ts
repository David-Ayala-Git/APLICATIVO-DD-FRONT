import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthApi } from '../../core/api';
import { Tenant, TenantStatus, UserSummary } from '../../core/models';
import { collection } from '../../core/state/collection';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { TablePagerComponent } from '../../shared/components/table-pager.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { normalize } from '../../shared/format';
import { tenantPlanLabel, tenantStatusLabel } from '../../shared/labels';
import { paginate } from '../../shared/pagination';

/**
 * Inicio del SUPER_ADMIN. No tiene tenant, asi que el dashboard gerencial (que
 * lee clientes, facturas y red de UN proveedor) le responderia 403 en todo:
 * aqui ve la plataforma - proveedores, sus usuarios y que modulos tiene cada uno.
 */
@Component({
  selector: 'app-platform-dashboard',
  imports: [
    RouterLink,
    AsyncStateComponent,
    StatCardComponent,
    StatusBadgeComponent,
    TablePagerComponent,
    RippleDirective,
  ],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h2>Consola de plataforma</h2>
          <p>Proveedores, usuarios y modulos de toda la instalacion</p>
        </div>
        <div class="head-actions">
          <button appRipple type="button" class="btn btn-outline btn-sm" (click)="reload()">
            <i class="fas fa-rotate"></i> Actualizar
          </button>
          <a appRipple class="btn btn-grad btn-sm" [routerLink]="['/app/settings']">
            <i class="fas fa-building"></i> Registrar ISP
          </a>
        </div>
      </div>

      <div class="stats-grid">
        <app-stat-card
          label="Proveedores"
          [value]="tenants.value().length"
          icon="fas fa-building"
          tone="violet"
          [note]="activeTenants() + ' activos'"
        />
        <app-stat-card
          label="Usuarios de ISP"
          [value]="ispUsers()"
          icon="fas fa-users"
          tone="cyan"
          note="Con acceso a la consola de su proveedor"
        />
        <app-stat-card
          label="Super Admins"
          [value]="superAdmins()"
          icon="fas fa-user-shield"
          tone="green"
          note="Administran la plataforma"
        />
      </div>

      <div class="card" style="margin-top: 1rem">
        <div class="card-header">
          <div class="topbar-search">
            <i class="fas fa-search"></i>
            <input
              placeholder="Buscar proveedor o slug…"
              [value]="search()"
              (input)="search.set($any($event.target).value)"
              aria-label="Buscar proveedor"
            />
          </div>
          <div class="row-wrap">
            @for (opt of statusOptions; track opt.value) {
              <button
                type="button"
                class="badge"
                [class.badge-violet]="statusFilter() === opt.value"
                [class.badge-gray]="statusFilter() !== opt.value"
                style="cursor: pointer; border: none; font-family: inherit"
                (click)="statusFilter.set(opt.value)"
              >
                {{ opt.text }}
              </button>
            }
            <a class="btn btn-outline btn-sm" [routerLink]="['/app/modules']">
              <i class="fas fa-cubes"></i> Modulos
            </a>
          </div>
        </div>

        <app-async-state
          [loading]="tenants.loading()"
          [error]="tenants.error()"
          [empty]="filteredTenants().length === 0"
          emptyIcon="fas fa-building"
          emptyTitle="Sin proveedores que coincidan"
          emptyText="Registra el primer ISP en Configuracion o ajusta los filtros."
          (retry)="tenants.reload()"
        />

        @if (filteredTenants().length > 0) {
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Plan</th>
                  <th>Estado</th>
                  <th>Usuarios</th>
                  <th>Modulos activos</th>
                </tr>
              </thead>
              <tbody>
                @for (row of pager.items(); track row.id) {
                  <tr>
                    <td>
                      <div class="cell-main">{{ row.name }}</div>
                      <div class="cell-sub mono">{{ row.slug }}</div>
                    </td>
                    <td><app-status-badge [label]="planLabel(row.plan)" /></td>
                    <td><app-status-badge [label]="statusLabel(row.status)" /></td>
                    <td>{{ usersOf(row) }}</td>
                    <td>
                      <div class="row-wrap">
                        @for (key of enabledModules(row); track key) {
                          <span class="badge badge-gray mono" style="font-size: 0.62rem">{{ key }}</span>
                        } @empty {
                          <span class="cell-sub">Ninguno</span>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-table-pager [pager]="pager" />
        }
      </div>
    </div>
  `,
})
export class PlatformDashboardComponent {
  private readonly api = inject(AuthApi);

  protected readonly tenants = collection(() => this.api.tenants(), [] as Tenant[]);
  protected readonly users = collection(() => this.api.users(), [] as UserSummary[]);

  protected readonly search = signal('');
  protected readonly statusFilter = signal<TenantStatus | 'ALL'>('ALL');
  protected readonly statusOptions: { value: TenantStatus | 'ALL'; text: string }[] = [
    { value: 'ALL', text: 'Todos' },
    { value: 'ACTIVE', text: 'Activos' },
    { value: 'SUSPENDED', text: 'Suspendidos' },
  ];

  protected readonly filteredTenants = computed(() => {
    const term = normalize(this.search());
    const status = this.statusFilter();
    return this.tenants.value().filter((t) => {
      if (status !== 'ALL' && t.status !== status) {
        return false;
      }
      if (!term) {
        return true;
      }
      return [t.name, t.slug, t.plan].map((v) => normalize(v)).some((v) => v.includes(term));
    });
  });

  protected readonly pager = paginate(this.filteredTenants, 10);

  protected readonly activeTenants = computed(
    () => this.tenants.value().filter((t) => t.status === 'ACTIVE').length,
  );
  protected readonly ispUsers = computed(() => this.users.value().filter((u) => u.tenantId).length);
  protected readonly superAdmins = computed(
    () => this.users.value().filter((u) => u.role === 'SUPER_ADMIN').length,
  );

  protected usersOf(tenant: Tenant): number {
    return this.users.value().filter((u) => u.tenantId === tenant.id).length;
  }

  protected enabledModules(tenant: Tenant): string[] {
    return tenant.modules.filter((m) => m.enabled).map((m) => m.moduleKey).sort();
  }

  protected reload(): void {
    this.tenants.reload();
    this.users.reload();
  }

  protected readonly planLabel = tenantPlanLabel;
  protected readonly statusLabel = tenantStatusLabel;
}
