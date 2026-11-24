import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { AuthApi } from '../api';
import { JwtClaims, LoginRequest, LoginResponse, Role, UserSummary } from '../models';

const TOKEN_KEY = 'dd.token';
const USER_KEY = 'dd.user';

/**
 * Sesion del operador. El JWT es la unica fuente de verdad del tenant: el
 * gateway reescribe X-Tenant-Id con el claim del token y descarta cualquier
 * valor que mande el cliente, asi que el front no puede "cambiar de tenant"
 * sin volver a autenticarse.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);

  private readonly tokenSignal = signal<string | null>(readToken());
  private readonly userSignal = signal<UserSummary | null>(readUser());

  readonly token = this.tokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();

  readonly isAuthenticated = computed(() => {
    const token = this.tokenSignal();
    return token !== null && !isExpired(token);
  });

  /** Slug del tenant leido del claim del JWT (lo mismo que ve cada microservicio). */
  readonly tenantSlug = computed(() => {
    const token = this.tokenSignal();
    return token ? (decode(token)?.tenantId ?? null) : null;
  });

  readonly role = computed<Role | null>(() => this.userSignal()?.role ?? null);

  readonly initials = computed(() => {
    const name = this.userSignal()?.fullName ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return '··';
    }
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  });

  login(body: LoginRequest): Observable<LoginResponse> {
    return this.api.login(body).pipe(tap((res) => this.persist(res)));
  }

  logout(redirect = true): void {
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // modo privado o almacenamiento bloqueado: la sesion en memoria ya se limpio
    }
    if (redirect) {
      void this.router.navigate(['/login']);
    }
  }

  /** Cabecera para las peticiones salientes; null cuando no hay sesion util. */
  authorizationHeader(): string | null {
    const token = this.tokenSignal();
    return token && !isExpired(token) ? `Bearer ${token}` : null;
  }

  private persist(res: LoginResponse): void {
    this.tokenSignal.set(res.token);
    this.userSignal.set(res.user);
    try {
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    } catch {
      // sin almacenamiento la sesion dura solo lo que viva la pestana
    }
  }
}

function readToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    return token && !isExpired(token) ? token : null;
  } catch {
    return null;
  }
}

function readUser(): UserSummary | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserSummary) : null;
  } catch {
    return null;
  }
}

/** Decodifica el payload sin verificar la firma: eso lo hace el gateway. */
function decode(token: string): JwtClaims | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return null;
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(normalized)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const claims = decode(token);
  if (!claims?.exp) {
    // sin exp legible preferimos tratarlo como vencido antes que mandar basura al gateway
    return true;
  }
  return claims.exp * 1000 <= Date.now();
}
