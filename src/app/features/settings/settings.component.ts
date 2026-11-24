import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { AuthApi, CommsApi, NetworkApi } from '../../core/api';
import {
  baseRoleDisplayName,
  getRolePermissionSummary,
  matchesBaseRoleName,
} from '../../core/auth/access';
import { AuthService } from '../../core/auth/auth.service';
import {
  AiAgent,
  CustomRole,
  MikrotikRouter,
  Onu,
  Role,
  Tenant,
  UserSummary,
} from '../../core/models';
import { collection } from '../../core/state/collection';
import { DEFAULT_BRAND_ACCENT, DEFAULT_BRAND_PRIMARY } from '../../core/state/brand-theme';
import { TenantService } from '../../core/state/tenant.service';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { initials } from '../../shared/format';
import { roleLabel, tenantPlanLabel, tenantStatusLabel } from '../../shared/labels';
import { NAV } from '../../layout/shell/nav';

type Tab = 'empresa' | 'integraciones' | 'usuarios';

/**
 * Configuracion del proveedor. El estado de las integraciones se deduce de lo
 * que cada microservicio reporta (routers vinculados, ONUs registradas, agentes
 * de IA creados), no de una lista fija: si no hay nada registrado, la
 * integracion no esta en uso.
 */
@Component({
  selector: 'app-settings',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PageHeadComponent,
    StatusBadgeComponent,
    AsyncStateComponent,
    ModalComponent,
    RippleDirective,
  ],
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  private readonly api = inject(AuthApi);
  private readonly network = inject(NetworkApi);
  private readonly comms = inject(CommsApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly tenantService = inject(TenantService);

  protected readonly auth = inject(AuthService);

  /** Mismas paginas del sidebar: catalogo de lo que un rol personalizado puede ver. */
  protected readonly navCatalog = NAV;

  protected readonly tenants = collection(() => this.api.tenants(), [] as Tenant[]);
  protected readonly users = collection(() => this.api.users(), [] as UserSummary[]);
  protected readonly routers = collection(
    () => this.network.routers().pipe(catchError(() => of([] as MikrotikRouter[]))),
    [] as MikrotikRouter[],
  );
  protected readonly onus = collection(
    () => this.network.onus().pipe(catchError(() => of([] as Onu[]))),
    [] as Onu[],
  );
  protected readonly agents = collection(
    () => this.comms.agents().pipe(catchError(() => of([] as AiAgent[]))),
    [] as AiAgent[],
  );

  protected readonly tab = signal<Tab>('empresa');
  protected readonly addingUser = signal(false);
  protected readonly addingTenant = signal(false);
  protected readonly saving = signal(false);

  /** Dueno de la plataforma: sin tenant, administra todos los proveedores. */
  protected readonly isSuperAdmin = computed(() => this.auth.role() === 'SUPER_ADMIN');

  /**
   * Los 5 roles fijos del backend (enum, no editable). Super Admin solo lo
   * ofrece a otro Super Admin: dd_ms_auth rechaza que un ADMIN_ISP lo cree.
   */
  protected readonly roleOptions = computed<{ value: Role; text: string }[]>(() => [
    { value: 'ADMIN_ISP', text: 'Admin del ISP' },
    { value: 'OPERADOR', text: 'Operador' },
    { value: 'CARTERA', text: 'Cartera' },
    { value: 'TECNICO', text: 'Tecnico' },
    ...(this.isSuperAdmin() ? [{ value: 'SUPER_ADMIN' as Role, text: 'Super Admin' }] : []),
  ]);

  // ---------- Roles personalizados (Configuracion > Usuarios y roles) ----------

  /** Proveedor elegido por el Super Admin para administrar sus roles personalizados. */
  protected readonly selectedRoleTenantId = signal('');
  protected readonly customRoles = signal<CustomRole[]>([]);
  protected readonly customRolesLoading = signal(false);
  protected readonly customRolesError = signal<string | null>(null);
  protected readonly editingRole = signal<CustomRole | 'new' | null>(null);
  protected readonly busyRoleId = signal<string | null>(null);
  protected readonly roleEnabled = signal(true);
  /** Roles habilitados del proveedor elegido en el modal "Nuevo usuario". */
  protected readonly userModalRoles = signal<CustomRole[]>([]);
  /** Permisos marcados en el formulario de rol; aparte del FormGroup porque son
   *  un conjunto de casillas, no un control reactivo convencional. */
  protected readonly selectedPermissions = signal<Set<string>>(new Set());

  protected readonly presetRoles: { value: Role; text: string }[] = [
    { value: 'ADMIN_ISP', text: 'Admin del ISP' },
    { value: 'OPERADOR', text: 'Operador' },
    { value: 'CARTERA', text: 'Cartera' },
    { value: 'TECNICO', text: 'Tecnico' },
  ];

  private readonly navItemIndex = new Map(
    NAV.flatMap((section) => section.items.map((item) => [item.path, item] as const)),
  );

  protected readonly allNavPaths = NAV.flatMap((section) => section.items.map((item) => item.path));

  protected readonly roleForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
  });

  /** Solo quien puede gestionar roles en el backend ve los controles aqui. */
  protected readonly canManageRoles = computed(() => {
    const role = this.auth.role();
    return role === 'SUPER_ADMIN' || role === 'ADMIN_ISP';
  });

  protected readonly userForm = this.fb.nonNullable.group({
    fullName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    role: ['OPERADOR' as Role, Validators.required],
    customRoleId: [''],
    /** Solo lo elige el Super Admin; los demas crean dentro de su proveedor. */
    tenantId: [''],
  });

  protected readonly showRoleGuide = signal(true);

  private readonly selectedUserRole = toSignal(this.userForm.controls.role.valueChanges, {
    initialValue: this.userForm.controls.role.value,
  });

  private readonly selectedUserTenantId = toSignal(this.userForm.controls.tenantId.valueChanges, {
    initialValue: this.userForm.controls.tenantId.value,
  });

  /**
   * Permisos de cada rol base visibles para el administrador actual.
   * Si el proveedor gestionado tiene una personalizacion guardada para ese rol
   * (mismo nombre en custom_role), muestra esos permisos y estado en vivo.
   */
  protected readonly baseRoleSummaries = computed(() => {
    const targetTenant = this.managedRoleTenant();
    const customList = this.customRoles();
    return this.roleOptions().map((opt) => {
      const info = getRolePermissionSummary(opt.value, opt.value === 'SUPER_ADMIN' ? null : targetTenant);
      const override =
        opt.value === 'SUPER_ADMIN'
          ? null
          : (customList.find((r) => matchesBaseRoleName(r.name, opt.value)) ?? null);
      const effectivePages = override
        ? override.permissions.map((path) => {
            const meta = this.pageLabel(path);
            const fromBase = info.pages.find((p) => p.path === path);
            return {
              path,
              label: meta.label,
              icon: meta.icon,
              mode: fromBase?.mode ?? ('full' as const),
              modeLabel: fromBase?.modeLabel ?? 'Permitido',
              moduleEnabled: fromBase?.moduleEnabled ?? true,
            };
          })
        : info.pages;
      return {
        ...opt,
        info,
        override,
        effectivePages,
        enabled: override ? override.enabled !== false : true,
      };
    });
  });

  /** Vista previa en vivo del rol seleccionado en el modal "Nuevo usuario". */
  protected readonly selectedRoleSummary = computed(() => {
    const role = this.selectedUserRole();
    const targetTenant =
      role === 'SUPER_ADMIN'
        ? null
        : this.isSuperAdmin()
          ? (this.tenants.value().find((t) => t.id === this.selectedUserTenantId()) ?? null)
          : this.tenant();
    return getRolePermissionSummary(role, targetTenant);
  });

  /** Colores de marca del proveedor de la sesion (los aplica TenantService a toda la consola). */
  protected readonly brandForm = this.fb.nonNullable.group({
    brandPrimary: [DEFAULT_BRAND_PRIMARY],
    brandAccent: [DEFAULT_BRAND_ACCENT],
  });

  private readonly syncBrandForm = effect(() => {
    const tenant = this.tenant();
    this.brandForm.reset({
      brandPrimary: tenant?.brandPrimary ?? DEFAULT_BRAND_PRIMARY,
      brandAccent: tenant?.brandAccent ?? DEFAULT_BRAND_ACCENT,
    });
    if (this.canManageRoles()) {
      this.brandForm.enable();
    } else {
      this.brandForm.disable();
    }
  });

  protected readonly tenantForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]{3,60}$/)]],
  });

  protected readonly tenant = computed(() => {
    const slug = this.auth.tenantSlug();
    return this.tenants.value().find((t) => t.slug === slug) ?? null;
  });

  /**
   * Proveedor cuyos roles se estan administrando:
   * - ADMIN_ISP: siempre su propio proveedor.
   * - SUPER_ADMIN: el que elija en el selector (por defecto el primero de la lista).
   */
  protected readonly managedRoleTenant = computed<Tenant | null>(() => {
    if (!this.isSuperAdmin()) {
      return this.tenant();
    }
    const list = this.tenants.value();
    const chosen = this.selectedRoleTenantId();
    return list.find((t) => t.id === chosen) ?? list[0] ?? null;
  });

  /** Roles activos disponibles para asignar al crear un usuario. */
  protected readonly assignableCustomRoles = computed(() => {
    const source = this.isSuperAdmin() ? this.userModalRoles() : this.customRoles();
    return source.filter((r) => r.enabled !== false);
  });

  /**
   * Usuarios visibles: dd_ms_auth ya filtra por quien llama (Super Admin ve
   * todos, Admin del ISP los de su proveedor, el resto solo a si mismo).
   */
  protected readonly tenantUsers = computed(() => this.users.value());

  /** Para el Super Admin, que ve usuarios de varios proveedores a la vez. */
  protected tenantName(tenantId: string | null): string {
    if (!tenantId) {
      return 'Plataforma';
    }
    return this.tenants.value().find((t) => t.id === tenantId)?.name ?? 'Otro proveedor';
  }

  protected enabledModules(row: Tenant): number {
    return row.modules.filter((m) => m.enabled).length;
  }

  /**
   * En cuanto se conoce el proveedor a administrar se piden sus roles personalizados.
   * Funciona tanto para ADMIN_ISP (su tenant) como para SUPER_ADMIN (tenant elegido).
   */
  private readonly loadRolesEffect = effect(() => {
    const tenantId = this.managedRoleTenant()?.id;
    if (tenantId && this.canManageRoles()) {
      this.loadRoles(tenantId);
    } else {
      this.customRoles.set([]);
    }
  });

  /** Para el Super Admin en "Nuevo usuario": carga los roles del proveedor seleccionado. */
  private readonly loadUserModalRolesEffect = effect(() => {
    if (!this.isSuperAdmin() || !this.addingUser()) {
      return;
    }
    const tenantId = this.selectedUserTenantId();
    if (!tenantId) {
      this.userModalRoles.set([]);
      return;
    }
    this.api
      .roles(tenantId)
      .pipe(catchError(() => of([] as CustomRole[])))
      .subscribe((roles) => this.userModalRoles.set(roles));
  });

  protected customRoleName(customRoleId: string | null): string | null {
    if (!customRoleId) {
      return null;
    }
    return this.customRoles().find((r) => r.id === customRoleId)?.name ?? null;
  }

  protected pageLabel(path: string): { label: string; icon: string } {
    const found = this.navItemIndex.get(path);
    return found ? { label: found.label, icon: found.icon } : { label: path, icon: 'fas fa-circle' };
  }

  protected isRoleEnabled(role: CustomRole): boolean {
    return role.enabled !== false;
  }

  protected assignedUsersCount(roleId: string): number {
    return this.users.value().filter((u) => u.customRoleId === roleId).length;
  }

  protected readonly integrations = computed(() => {
    const routers = this.routers.value();
    const onus = this.onus.value();
    const agents = this.agents.value();
    const olts = new Set(onus.map((o) => o.oltName)).size;

    return [
      {
        name: 'MikroTik RouterOS',
        icon: 'fas fa-network-wired',
        color: '#7c3aed',
        detail:
          routers.length > 0
            ? `${routers.length} router(s) vinculado(s), ${routers.filter((r) => r.status === 'ONLINE').length} en linea`
            : 'Ningun router vinculado todavia',
        ready: routers.length > 0,
      },
      {
        name: 'OLT GPON',
        icon: 'fas fa-satellite-dish',
        color: '#0e7490',
        detail:
          olts > 0
            ? `${olts} OLT(s) con ${onus.length} ONU(s) registradas`
            : 'Ninguna ONU registrada todavia',
        ready: olts > 0,
      },
      {
        name: 'WhatsApp Cloud API',
        icon: 'fab fa-whatsapp',
        color: '#059669',
        detail:
          'Requiere WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID en el entorno del microservicio',
        ready: null,
      },
      {
        name: 'Proveedor de IA',
        icon: 'fas fa-brain',
        color: '#7c3aed',
        detail:
          agents.length > 0
            ? `${agents.length} agente(s) configurado(s); necesitan ANTHROPIC_API_KEY`
            : 'Sin agentes configurados',
        ready: agents.length > 0 ? null : false,
      },
      {
        name: 'Facturacion electronica DIAN',
        icon: 'fas fa-file-invoice',
        color: '#d97706',
        detail: 'El CUFE lo asigna el proveedor tecnologico al timbrar cada factura',
        ready: null,
      },
      {
        name: 'Pasarela de pagos',
        icon: 'fas fa-credit-card',
        color: '#0e7490',
        detail: 'Apunta el webhook de la pasarela a POST /api/payments/webhook',
        ready: null,
      },
    ];
  });

  protected openAddUser(): void {
    this.userForm.reset({
      fullName: '',
      email: '',
      password: '',
      role: 'OPERADOR',
      customRoleId: '',
      tenantId: '',
    });
    this.addingUser.set(true);
  }

  protected openAddTenant(): void {
    this.tenantForm.reset({ name: '', slug: '' });
    this.addingTenant.set(true);
  }

  protected closeModals(): void {
    this.addingUser.set(false);
    this.addingTenant.set(false);
  }

  protected saveUser(): void {
    if (this.userForm.invalid || this.saving()) {
      this.userForm.markAllAsTouched();
      return;
    }
    const raw = this.userForm.getRawValue();
    // El Super Admin elige el proveedor (o ninguno si crea otro Super Admin);
    // el resto crea dentro del proveedor de la sesion.
    let tenantId: string | null = this.tenant()?.id ?? null;
    if (this.isSuperAdmin()) {
      tenantId = raw.role === 'SUPER_ADMIN' ? null : raw.tenantId || null;
      if (raw.role !== 'SUPER_ADMIN' && !tenantId) {
        this.toast.error('Elige el proveedor al que pertenece el usuario.');
        return;
      }
    }
    this.saving.set(true);
    this.api
      .createUser({
        fullName: raw.fullName,
        email: raw.email,
        password: raw.password,
        role: raw.role,
        tenantId,
        customRoleId: raw.customRoleId || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.addingUser.set(false);
          this.toast.success('Usuario creado.');
          this.users.reload();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  // ---------- Roles personalizados ----------

  protected openCreateRole(): void {
    if (!this.canManageRoles() || !this.managedRoleTenant()) {
      return;
    }
    this.roleForm.reset({ name: '', description: '' });
    this.selectedPermissions.set(new Set(['dashboard']));
    this.roleEnabled.set(true);
    this.editingRole.set('new');
  }

  protected openEditRole(role: CustomRole): void {
    if (!this.canManageRoles()) {
      return;
    }
    this.roleForm.reset({ name: role.name, description: role.description ?? '' });
    this.selectedPermissions.set(new Set(role.permissions));
    this.roleEnabled.set(role.enabled !== false);
    this.editingRole.set(role);
  }

  /**
   * Abre el editor de permisos directamente desde una tarjeta de rol base
   * (Admin del ISP, Operador, Cartera, Tecnico): si ya tiene configuracion
   * guardada en el proveedor la edita; si no, precarga sus permisos actuales.
   */
  protected openEditBaseRole(role: Role): void {
    const targetTenant = this.managedRoleTenant();
    if (!this.canManageRoles() || !targetTenant || role === 'SUPER_ADMIN') {
      return;
    }
    const existing = this.customRoles().find((r) => matchesBaseRoleName(r.name, role));
    if (existing) {
      this.openEditRole(existing);
      return;
    }
    const summary = getRolePermissionSummary(role, targetTenant);
    this.roleForm.reset({
      name: baseRoleDisplayName(role),
      description: summary.summary,
    });
    this.selectedPermissions.set(new Set(summary.pages.map((p) => p.path)));
    this.roleEnabled.set(true);
    this.editingRole.set('new');
  }

  /** Habilita o deshabilita un rol base para el proveedor gestionado en un solo clic. */
  protected toggleBaseRoleStatus(role: Role, enabled: boolean): void {
    const targetTenant = this.managedRoleTenant();
    if (!this.canManageRoles() || !targetTenant || role === 'SUPER_ADMIN' || this.busyRoleId()) {
      return;
    }
    const existing = this.customRoles().find((r) => matchesBaseRoleName(r.name, role));
    if (existing) {
      this.toggleRoleStatus(existing, enabled);
      return;
    }
    const summary = getRolePermissionSummary(role, targetTenant);
    this.busyRoleId.set(role);
    this.api
      .createRole(targetTenant.id, {
        name: baseRoleDisplayName(role),
        description: summary.summary,
        permissions: summary.pages.map((p) => p.path),
      })
      .subscribe({
        next: (created) => {
          if (enabled) {
            this.busyRoleId.set(null);
            this.loadRoles(targetTenant.id);
            return;
          }
          this.api.updateRoleStatus(targetTenant.id, created.id, false).subscribe({
            next: () => {
              this.busyRoleId.set(null);
              this.toast.success(`Rol "${created.name}" deshabilitado para ${targetTenant.name}.`);
              this.loadRoles(targetTenant.id);
              this.tenantService.refresh();
            },
            error: (err: unknown) => {
              this.busyRoleId.set(null);
              this.toast.error(describeHttpError(err));
              this.loadRoles(targetTenant.id);
            },
          });
        },
        error: (err: unknown) => {
          this.busyRoleId.set(null);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  protected closeRoleModal(): void {
    this.editingRole.set(null);
  }

  protected togglePermission(key: string, checked: boolean): void {
    this.selectedPermissions.update((set) => {
      const next = new Set(set);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  protected isPermissionChecked(key: string): boolean {
    return this.selectedPermissions().has(key);
  }

  protected applyBaseRolePreset(role: Role): void {
    const summary = getRolePermissionSummary(role, this.managedRoleTenant());
    this.selectedPermissions.set(new Set(summary.pages.map((p) => p.path)));
  }

  protected selectAllPermissions(): void {
    this.selectedPermissions.set(new Set(this.allNavPaths));
  }

  protected clearAllPermissions(): void {
    this.selectedPermissions.set(new Set());
  }

  protected isSectionAllSelected(items: { path: string }[]): boolean {
    const current = this.selectedPermissions();
    return items.every((item) => current.has(item.path));
  }

  protected toggleSectionPermissions(items: { path: string }[]): void {
    const selectAll = !this.isSectionAllSelected(items);
    this.selectedPermissions.update((set) => {
      const next = new Set(set);
      for (const item of items) {
        if (selectAll) {
          next.add(item.path);
        } else {
          next.delete(item.path);
        }
      }
      return next;
    });
  }

  protected saveRole(): void {
    const tenantId = this.managedRoleTenant()?.id;
    const target = this.editingRole();
    if (!this.canManageRoles() || !tenantId || !target || this.roleForm.invalid || this.saving()) {
      this.roleForm.markAllAsTouched();
      return;
    }
    const raw = this.roleForm.getRawValue();
    const permissions = [...this.selectedPermissions()];
    this.saving.set(true);

    const request$ =
      target === 'new'
        ? this.api.createRole(tenantId, {
            name: raw.name,
            description: raw.description || null,
            permissions,
          })
        : this.api.updateRole(tenantId, target.id, {
            name: raw.name,
            description: raw.description || null,
            permissions,
            enabled: this.roleEnabled(),
          });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.editingRole.set(null);
        this.toast.success(target === 'new' ? 'Rol creado.' : 'Permisos del rol actualizados.');
        this.loadRoles(tenantId);
        this.tenantService.refresh();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected toggleRoleStatus(role: CustomRole, enabled: boolean): void {
    const tenantId = this.managedRoleTenant()?.id;
    if (!this.canManageRoles() || !tenantId || this.busyRoleId()) {
      return;
    }
    this.busyRoleId.set(role.id);
    this.api.updateRoleStatus(tenantId, role.id, enabled).subscribe({
      next: (updated) => {
        this.busyRoleId.set(null);
        this.customRoles.update((list) => list.map((r) => (r.id === updated.id ? updated : r)));
        this.toast.success(enabled ? `Rol "${role.name}" habilitado.` : `Rol "${role.name}" deshabilitado.`);
        this.tenantService.refresh();
      },
      error: (err: unknown) => {
        this.busyRoleId.set(null);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected deleteRole(role: CustomRole): void {
    const tenantId = this.managedRoleTenant()?.id;
    if (!this.canManageRoles() || !tenantId || this.busyRoleId()) {
      return;
    }
    if (!confirm(`¿Eliminar el rol "${role.name}"? Esto no se puede deshacer.`)) {
      return;
    }
    this.busyRoleId.set(role.id);
    this.api.deleteRole(tenantId, role.id).subscribe({
      next: () => {
        this.busyRoleId.set(null);
        this.toast.success('Rol eliminado.');
        this.loadRoles(tenantId);
      },
      error: (err: unknown) => {
        this.busyRoleId.set(null);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  /** protected (no private): el template la llama para reintentar la carga. */
  protected loadRoles(tenantId: string): void {
    this.customRolesLoading.set(true);
    this.customRolesError.set(null);
    this.api.roles(tenantId).subscribe({
      next: (roles) => {
        this.customRolesLoading.set(false);
        this.customRoles.set(roles);
      },
      error: (err: unknown) => {
        this.customRolesLoading.set(false);
        this.customRolesError.set(describeHttpError(err));
      },
    });
  }

  protected saveTenant(): void {
    if (this.tenantForm.invalid || this.saving()) {
      this.tenantForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api.createTenant(this.tenantForm.getRawValue()).subscribe({
      next: (tenant) => {
        this.saving.set(false);
        this.addingTenant.set(false);
        this.toast.success(
          `Proveedor "${tenant.name}" registrado. Crea su primer usuario para que pueda ingresar.`,
        );
        this.tenants.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  /** Sugerencia de slug a partir del nombre, con el formato que exige el backend. */
  protected onTenantNameInput(value: string): void {
    if (this.tenantForm.controls.slug.dirty) {
      return;
    }
    const slug = value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    this.tenantForm.controls.slug.setValue(slug);
  }

  protected brandChanged(): boolean {
    const tenant = this.tenant();
    const raw = this.brandForm.getRawValue();
    return !!tenant && (raw.brandPrimary !== tenant.brandPrimary || raw.brandAccent !== tenant.brandAccent);
  }

  protected resetBrandDefaults(): void {
    this.brandForm.setValue({ brandPrimary: DEFAULT_BRAND_PRIMARY, brandAccent: DEFAULT_BRAND_ACCENT });
    this.saveBranding();
  }

  protected saveBranding(): void {
    const tenant = this.tenant();
    if (!tenant || this.saving() || !this.brandChanged()) {
      return;
    }
    this.saving.set(true);
    this.api.updateBranding(tenant.id, this.brandForm.getRawValue()).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.tenants.update((all) => all.map((t) => (t.id === updated.id ? updated : t)));
        this.tenantService.replaceTenant(updated);
        this.toast.success('Colores de marca guardados.');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected readonly initials = initials;
  protected readonly roleLabel = roleLabel;
  protected readonly planLabel = tenantPlanLabel;
  protected readonly statusLabel = tenantStatusLabel;
}
