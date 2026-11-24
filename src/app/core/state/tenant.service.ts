import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthApi } from '../api';
import { AuthService } from '../auth/auth.service';
import { CustomRole, Tenant } from '../models';
import { applyBrandTheme } from './brand-theme';

/**
 * Tenant de la sesion (el que indica el claim del JWT), compartido por toda la
 * consola: el sidebar lo usa para el nombre y el plan, Modulos para los
 * interruptores y cualquier pantalla puede apagar una funcionalidad puntual
 * leyendo `config` sin volver a pedirlo. Una sola fuente evita que, tras
 * cambiar algo en Modulos, otra pantalla siga mostrando el dato viejo.
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly authApi = inject(AuthApi);
  private readonly auth = inject(AuthService);

  private readonly tenantSignal = signal<Tenant | null>(null);
  private readonly loadingSignal = signal(false);
  /** Solo se llena cuando el usuario de la sesion tiene un customRoleId. */
  private readonly customRolesSignal = signal<CustomRole[]>([]);
  /** Slug para el que ya hay respuesta de /tenants (cambia al re-autenticarse). */
  private loadedSlug: string | null = null;

  readonly tenant = this.tenantSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  /** Colores del proveedor en toda la consola; al cerrar sesion vuelve el tema base. */
  private readonly brandEffect = effect(() =>
    applyBrandTheme(this.auth.isAuthenticated() ? this.tenantSignal() : null),
  );

  /** Tras guardar en Configuracion: refleja el tenant devuelto sin volver a pedirlo. */
  replaceTenant(tenant: Tenant): void {
    if (tenant.slug === this.auth.tenantSlug()) {
      this.tenantSignal.set(tenant);
    }
  }

  refresh(): void {
    this.load().subscribe();
  }

  /**
   * Para los guards: la primera navegacion llega antes de que el shell pida el
   * tenant, y decidir con `null` mandaria a todos al dashboard. Si ya se cargo
   * para esta sesion, responde con lo que hay sin volver a pedirlo.
   */
  ensureLoaded(): Observable<Tenant | null> {
    const slug = this.auth.tenantSlug();
    return slug && this.loadedSlug === slug ? of(this.tenantSignal()) : this.load();
  }

  private load(): Observable<Tenant | null> {
    const slug = this.auth.tenantSlug();
    if (!slug) {
      this.tenantSignal.set(null);
      this.customRolesSignal.set([]);
      this.loadedSlug = null;
      return of(null);
    }
    this.loadingSignal.set(true);
    return this.authApi.tenants().pipe(
      catchError(() => of([] as Tenant[])),
      map((tenants) => {
        this.loadingSignal.set(false);
        const tenant = tenants.find((t) => t.slug === slug) ?? null;
        this.tenantSignal.set(tenant);
        this.loadedSlug = slug;
        this.refreshCustomRoles(tenant);
        return tenant;
      }),
    );
  }

  /** true si el modulo tiene una fila en tenant_module con enabled = true. */
  moduleEnabled(moduleKey: string): Signal<boolean> {
    return computed(
      () => this.tenantSignal()?.modules.find((m) => m.moduleKey === moduleKey)?.enabled ?? false,
    );
  }

  /**
   * Interruptor fino dentro de un modulo (p. ej. "billing.manualPayments"),
   * guardado en el JSON `config` de tenant_module. A diferencia del modulo en
   * si, esto NO lo valida ningun backend: es una preferencia que cada pantalla
   * respeta por su cuenta. Por defecto queda visible (true) salvo que un admin
   * lo haya apagado explicitamente desde Modulos - asi un tenant que nunca
   * toco el interruptor no pierde nada que ya tenia.
   */
  featureEnabled(moduleKey: string, featureKey: string): Signal<boolean> {
    return computed(() => {
      const config = this.tenantSignal()?.modules.find((m) => m.moduleKey === moduleKey)?.config;
      return config?.[featureKey] !== false;
    });
  }

  /**
   * Claves de pagina que el usuario de la sesion puede ver, segun su rol
   * personalizado (Configuracion > Usuarios y roles). `null` = sin restriccion
   * (no tiene rol personalizado asignado, o aun no termino de cargar): el
   * comportamiento por defecto es ver todo, igual que antes de que existiera
   * esto. Esto solo oculta enlaces del menu - ningun backend lo valida todavia.
   */
  readonly effectivePermissions = computed<string[] | null>(() => {
    const customRoleId = this.auth.user()?.customRoleId;
    if (!customRoleId) {
      return null;
    }
    const role = this.customRolesSignal().find((r) => r.id === customRoleId);
    if (!role) {
      return null;
    }
    // Un rol deshabilitado restringe el acceso a las paginas adicionales hasta reactivarlo.
    if (role.enabled === false) {
      return [];
    }
    return role.permissions;
  });

  private refreshCustomRoles(tenant: Tenant | null): void {
    const customRoleId = this.auth.user()?.customRoleId;
    if (!tenant || !customRoleId) {
      this.customRolesSignal.set([]);
      return;
    }
    // El usuario con sesion puede no ser SUPER_ADMIN/ADMIN_ISP (quienes
    // administran roles); igual necesita leer SU propio rol para que el
    // sidebar sepa que mostrarle. El backend permite el GET a cualquier rol
    // autenticado del tenant - solo create/update/delete estan restringidos.
    this.authApi
      .roles(tenant.id)
      .pipe(catchError(() => of([] as CustomRole[])))
      .subscribe((roles) => this.customRolesSignal.set(roles));
  }
}
