import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CreateCustomRoleRequest,
  CreateTenantRequest,
  CreateUserRequest,
  CustomRole,
  LoginRequest,
  LoginResponse,
  Tenant,
  UpdateCustomRoleRequest,
  UpdateTenantBrandingRequest,
  UpdateTenantModuleRequest,
  UserSummary,
} from '../models';
import { API } from './api.config';

/** dd_ms_auth: login, tenants y usuarios. */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(body: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(API.auth.login, body);
  }

  tenants(): Observable<Tenant[]> {
    return this.http.get<Tenant[]>(API.auth.tenants);
  }

  tenant(id: string): Observable<Tenant> {
    return this.http.get<Tenant>(`${API.auth.tenants}/${id}`);
  }

  createTenant(body: CreateTenantRequest): Observable<Tenant> {
    return this.http.post<Tenant>(API.auth.tenants, body);
  }

  /** Activa o desactiva un modulo del tenant: es lo que lee el guard @RequiresModule. */
  updateModule(
    tenantId: string,
    moduleKey: string,
    body: UpdateTenantModuleRequest,
  ): Observable<Tenant> {
    return this.http.put<Tenant>(`${API.auth.tenants}/${tenantId}/modules/${moduleKey}`, body);
  }

  /** Colores de marca (#RRGGBB). Solo Super Admin o el Admin del propio ISP. */
  updateBranding(tenantId: string, body: UpdateTenantBrandingRequest): Observable<Tenant> {
    return this.http.put<Tenant>(`${API.auth.tenants}/${tenantId}/branding`, body);
  }

  users(): Observable<UserSummary[]> {
    return this.http.get<UserSummary[]>(API.auth.users);
  }

  createUser(body: CreateUserRequest): Observable<UserSummary> {
    return this.http.post<UserSummary>(API.auth.users, body);
  }

  /**
   * Roles personalizados del proveedor. Solo SUPER_ADMIN o el ADMIN_ISP del
   * propio tenant pueden escribir aqui; el backend responde 403 si no.
   */
  roles(tenantId: string): Observable<CustomRole[]> {
    return this.http.get<CustomRole[]>(`${API.auth.tenants}/${tenantId}/roles`);
  }

  createRole(tenantId: string, body: CreateCustomRoleRequest): Observable<CustomRole> {
    return this.http.post<CustomRole>(`${API.auth.tenants}/${tenantId}/roles`, body);
  }

  updateRole(tenantId: string, roleId: string, body: UpdateCustomRoleRequest): Observable<CustomRole> {
    return this.http.put<CustomRole>(`${API.auth.tenants}/${tenantId}/roles/${roleId}`, body);
  }

  /** 409 si hay usuarios asignados: hay que reasignarlos antes de borrar. */
  deleteRole(tenantId: string, roleId: string): Observable<void> {
    return this.http.delete<void>(`${API.auth.tenants}/${tenantId}/roles/${roleId}`);
  }
}
