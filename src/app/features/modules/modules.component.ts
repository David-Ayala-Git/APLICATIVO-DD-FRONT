import { Component, computed, inject, signal } from '@angular/core';

import { of } from 'rxjs';

import { AuthApi } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { Tenant } from '../../core/models';
import { collection } from '../../core/state/collection';
import { TenantService } from '../../core/state/tenant.service';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { tenantPlanLabel, tenantStatusLabel } from '../../shared/labels';

interface FeatureDef {
  /** Clave dentro del JSON `config` del modulo (p. ej. "manualPayments"). */
  key: string;
  label: string;
  description: string;
}

interface ModuleDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  group: string;
  /**
   * true cuando el backend realmente valida la clave con @RequiresModule.
   * Apagar uno de estos devuelve 403 en las rutas del microservicio.
   */
  enforced: boolean;
  /**
   * Interruptores finos dentro del modulo. A diferencia de `enforced`, ningun
   * backend los valida: cada pantalla decide por su cuenta si esconde algo
   * segun lo que haya en `config`. Sirven para apagar un boton o una opcion
   * puntual sin apagar el modulo entero.
   */
  features?: FeatureDef[];
}

/**
 * Activacion modular por proveedor. Los modulos "enforced" (todos menos
 * automation) son los que el guard @RequiresModule de ms-common consulta contra
 * dd_ms_auth: al apagarlos, el microservicio responde 403 y la seccion
 * correspondiente deja de funcionar de verdad. Automation, sin backend
 * propio, solo lo bloquea pageGuard en la consola. Las "features" van un nivel mas abajo:
 * encienden o apagan un elemento puntual de la pantalla (p. ej. un boton),
 * y las lee cada pantalla por su cuenta desde TenantService.
 */
@Component({
  selector: 'app-modules',
  imports: [PageHeadComponent, StatusBadgeComponent],
  templateUrl: './modules.component.html',
})
export class ModulesComponent {
  private readonly api = inject(AuthApi);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  protected readonly tenantService = inject(TenantService);

  /**
   * El Super Admin no tiene tenant propio: elige sobre que proveedor trabaja.
   * Los demas siempre ven el de su sesion (TenantService).
   */
  protected readonly isSuperAdmin = computed(() => this.auth.role() === 'SUPER_ADMIN');
  protected readonly platformTenants = collection(
    () => (this.isSuperAdmin() ? this.api.tenants() : of([] as Tenant[])),
    [] as Tenant[],
  );
  protected readonly selectedTenantId = signal<string | null>(null);

  protected readonly tenant = computed<Tenant | null>(() => {
    if (!this.isSuperAdmin()) {
      return this.tenantService.tenant();
    }
    const all = this.platformTenants.value();
    return all.find((t) => t.id === this.selectedTenantId()) ?? all[0] ?? null;
  });

  protected readonly loading = computed(() =>
    this.isSuperAdmin() ? this.platformTenants.loading() : this.tenantService.loading(),
  );

  protected readonly busyKey = signal<string | null>(null);

  protected readonly catalog: ModuleDef[] = [
    {
      key: 'network',
      name: 'Red: MikroTik, GPON, cobertura e inventario',
      description:
        'Routers, ONUs, nodos y equipos. Es el modulo que valida dd_ms_network en cada peticion.',
      icon: 'fas fa-network-wired',
      color: '#7c3aed',
      group: 'Red',
      enforced: true,
    },
    {
      key: 'support',
      name: 'Soporte: mesa de ayuda y tecnicos',
      description:
        'Tickets con SLA, cuadrilla y ordenes de trabajo. Validado por dd_ms_support.',
      icon: 'fas fa-headset',
      color: '#0e7490',
      group: 'Operacion',
      enforced: true,
    },
    {
      key: 'comms',
      name: 'Comunicaciones: WhatsApp y agentes de IA',
      description:
        'Cloud API de Meta y asistentes de IA. Validado por dd_ms_comms en los envios y el chat.',
      icon: 'fab fa-whatsapp',
      color: '#059669',
      group: 'Comunicacion',
      enforced: true,
    },
    {
      key: 'crm',
      name: 'CRM de clientes',
      description: 'Ficha, historial y segmentacion. Nucleo de la plataforma. Validado por dd_ms_crm.',
      icon: 'fas fa-users',
      color: '#7c3aed',
      group: 'Core',
      enforced: true,
    },
    {
      key: 'billing',
      name: 'Facturacion y pagos',
      description: 'Corrida mensual, facturacion electronica y conciliacion. Validado por dd_ms_billing.',
      icon: 'fas fa-file-invoice-dollar',
      color: '#0e7490',
      group: 'Core',
      enforced: true,
      features: [
        {
          key: 'manualPayments',
          label: 'Registrar pago manual',
          description:
            'Muestra en Pagos el boton para registrar efectivo o Nequi confirmado a mano.',
        },
      ],
    },
    {
      key: 'contracts',
      name: 'Contratos y firma',
      description: 'Expediente digital y registro de firma del cliente. Validado por dd_ms_crm.',
      icon: 'fas fa-file-signature',
      color: '#d97706',
      group: 'Documentos',
      enforced: true,
    },
    {
      key: 'reports',
      name: 'Reportes ejecutivos',
      description: 'MRR, ARPU y churn calculados por periodo. Validado por dd_ms_reports.',
      icon: 'fas fa-chart-line',
      color: '#7c3aed',
      group: 'Analitica',
      enforced: true,
    },
    {
      key: 'automation',
      name: 'Automatizacion n8n',
      description: 'Flujos entre modulos sin escribir codigo.',
      icon: 'fas fa-diagram-project',
      color: '#0e7490',
      group: 'Premium',
      enforced: false,
    },
  ];

  protected readonly rows = computed(() => {
    const modules = this.tenant()?.modules ?? [];
    return this.catalog.map((def) => ({
      def,
      enabled: modules.find((m) => m.moduleKey === def.key)?.enabled ?? false,
      featureState: (def.features ?? []).map((feature) => ({
        feature,
        enabled: modules.find((m) => m.moduleKey === def.key)?.config?.[feature.key] !== false,
      })),
    }));
  });

  protected readonly enabledCount = computed(() => this.rows().filter((r) => r.enabled).length);

  protected toggle(key: string, enabled: boolean): void {
    const tenant = this.tenant();
    if (!tenant || this.busyKey()) {
      return;
    }
    // conserva el config que ya tuviera (features apagadas a mano): antes se
    // mandaba null aqui y un simple apagar/prender borraba esas preferencias.
    const current = tenant.modules.find((m) => m.moduleKey === key)?.config ?? null;
    this.busyKey.set(key);
    this.api.updateModule(tenant.id, key, { enabled, config: current }).subscribe({
      next: (updated) => {
        this.busyKey.set(null);
        this.toast.success(enabled ? `Modulo "${key}" activado.` : `Modulo "${key}" desactivado.`);
        this.afterUpdate(updated);
      },
      error: (err: unknown) => {
        this.busyKey.set(null);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected toggleFeature(moduleKey: string, featureKey: string, checked: boolean): void {
    const tenant = this.tenant();
    const busyId = `${moduleKey}.${featureKey}`;
    if (!tenant || this.busyKey()) {
      return;
    }
    const existing = tenant.modules.find((m) => m.moduleKey === moduleKey);
    const nextConfig = { ...(existing?.config ?? {}), [featureKey]: checked };
    this.busyKey.set(busyId);
    this.api
      .updateModule(tenant.id, moduleKey, { enabled: existing?.enabled ?? false, config: nextConfig })
      .subscribe({
        next: (updated) => {
          this.busyKey.set(null);
          this.toast.success(checked ? 'Funcionalidad activada.' : 'Funcionalidad desactivada.');
          this.afterUpdate(updated);
        },
        error: (err: unknown) => {
          this.busyKey.set(null);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  /** El PUT devuelve el tenant ya actualizado: el Super Admin lo reemplaza en su lista. */
  private afterUpdate(updated: Tenant): void {
    if (this.isSuperAdmin()) {
      this.platformTenants.update((all) => all.map((t) => (t.id === updated.id ? updated : t)));
    } else {
      this.tenantService.refresh();
    }
  }

  protected readonly planLabel = tenantPlanLabel;
  protected readonly statusLabel = tenantStatusLabel;
}
