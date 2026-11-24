/**
 * Espejo de los DTOs de dd_ms_auth (web/dto). Cualquier cambio alla debe
 * reflejarse aqui: el gateway no expone un contrato OpenAPI todavia.
 */

export type Role = 'SUPER_ADMIN' | 'ADMIN_ISP' | 'OPERADOR' | 'TECNICO' | 'CARTERA';
export type TenantPlan = 'TRIAL' | 'PRO' | 'ENTERPRISE';
export type TenantStatus = 'ACTIVE' | 'SUSPENDED';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  tenantId: string | null;
  /** Rol personalizado (Configuracion > Usuarios y roles) o null si solo rige `role`. */
  customRoleId: string | null;
}

export interface LoginResponse {
  token: string;
  tokenType: string;
  /** Segundos de vida del token, tal como los devuelve JwtService.expirationSeconds(). */
  expiresIn: number;
  user: UserSummary;
}

export interface TenantModule {
  moduleKey: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  brandPrimary: string | null;
  brandAccent: string | null;
  createdAt: string;
  modules: TenantModule[];
}

export interface CreateTenantRequest {
  name: string;
  /** minusculas, numeros y guiones, 3-60 caracteres (validado en el backend). */
  slug: string;
}

export interface UpdateTenantBrandingRequest {
  /** #RRGGBB */
  brandPrimary: string;
  brandAccent: string;
}

export interface UpdateTenantModuleRequest {
  enabled: boolean;
  config?: Record<string, unknown> | null;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  tenantId?: string | null;
  /** Debe pertenecer al mismo tenantId; el backend lo valida (404 si no cuadra). */
  customRoleId?: string | null;
}

/**
 * Rol personalizado de un proveedor: un nombre y la lista de paginas de la
 * consola que puede ver (claves iguales a las rutas de /app/*, p. ej.
 * "billing", "tickets"). Convive con el enum `Role` fijo: ese decide el nivel
 * administrativo, este afina la navegacion. Solo SUPER_ADMIN o el ADMIN_ISP
 * del propio tenant pueden crearlos/editarlos/borrarlos.
 */
export interface CustomRole {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions: string[];
  createdAt: string;
}

export interface CreateCustomRoleRequest {
  name: string;
  description?: string | null;
  permissions: string[];
}

export interface UpdateCustomRoleRequest {
  name: string;
  description?: string | null;
  permissions: string[];
}

/** Claims que el gateway lee del JWT para fijar X-Tenant-Id / X-User-Id / X-User-Role. */
export interface JwtClaims {
  sub: string;
  tenantId?: string;
  role?: Role;
  exp: number;
  iat?: number;
}
