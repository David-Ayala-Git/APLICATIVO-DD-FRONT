import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';

import { BillingApi, CommsApi, NetworkApi, SupportApi } from '../api';
import { AuthService } from '../auth/auth.service';

interface Counters {
  openTickets: number;
  unreadWhatsapp: number;
  unauthorizedOnus: number;
  overdueInvoices: number;
  routersOnline: number;
  routersTotal: number;
}

const EMPTY: Counters = {
  openTickets: 0,
  unreadWhatsapp: 0,
  unauthorizedOnus: 0,
  overdueInvoices: 0,
  routersOnline: 0,
  routersTotal: 0,
};

/**
 * Latido de la plataforma para los badges del menu y la pastilla "Red OK" del
 * topbar. Cada consulta falla en silencio a proposito: si un ISP tiene el
 * modulo de red o soporte apagado, el gateway responde 403 y eso no debe
 * romper la navegacion ni llenar la pantalla de errores.
 */
@Injectable({ providedIn: 'root' })
export class PlatformPulseService {
  private readonly support = inject(SupportApi);
  private readonly comms = inject(CommsApi);
  private readonly network = inject(NetworkApi);
  private readonly billing = inject(BillingApi);
  private readonly auth = inject(AuthService);

  private readonly state = signal<Counters>(EMPTY);

  readonly counters = this.state.asReadonly();

  /** Estado agregado de los routers, para la pastilla del topbar. */
  readonly networkHealth = computed<{ text: string; tone: 'ok' | 'warn' | 'down' }>(() => {
    const { routersOnline, routersTotal } = this.state();
    if (routersTotal === 0) {
      return { text: 'Sin routers', tone: 'warn' };
    }
    if (routersOnline === routersTotal) {
      return { text: 'Red OK', tone: 'ok' };
    }
    if (routersOnline === 0) {
      return { text: 'Red caida', tone: 'down' };
    }
    return { text: `${routersTotal - routersOnline} router(s) con falla`, tone: 'warn' };
  });

  refresh(): void {
    // sin tenant (Super Admin) todas estas rutas responden 403: no tiene caso pedirlas
    if (!this.auth.isAuthenticated() || !this.auth.tenantSlug()) {
      return;
    }

    forkJoin({
      tickets: this.support.tickets().pipe(catchError(() => of([]))),
      messages: this.comms.messages().pipe(catchError(() => of([]))),
      onus: this.network.onus().pipe(catchError(() => of([]))),
      invoices: this.billing.invoices().pipe(catchError(() => of([]))),
      routers: this.network.routers().pipe(catchError(() => of([]))),
    }).subscribe(({ tickets, messages, onus, invoices, routers }) => {
      this.state.set({
        openTickets: tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length,
        unreadWhatsapp: messages.filter((m) => m.direction === 'IN' && m.status === 'RECEIVED')
          .length,
        unauthorizedOnus: onus.filter((o) => o.status === 'UNAUTHORIZED').length,
        overdueInvoices: invoices.filter((i) => i.status === 'OVERDUE').length,
        routersOnline: routers.filter((r) => r.status === 'ONLINE').length,
        routersTotal: routers.length,
      });
    });
  }
}
