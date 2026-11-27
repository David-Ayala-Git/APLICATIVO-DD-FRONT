import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { canAccessPage } from '../../core/auth/access';
import { AuthService } from '../../core/auth/auth.service';
import { PlatformPulseService } from '../../core/state/platform-pulse.service';
import { TenantService } from '../../core/state/tenant.service';
import { ToastService } from '../../core/ui/toast.service';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { normalize } from '../../shared/format';
import { tenantPlanLabel } from '../../shared/labels';
import { NAV, NavCounter } from './nav';

const SIDEBAR_THEME_KEY = 'dd_sidebar_theme';

/**
 * Armazon de la consola: barra lateral, topbar y el outlet donde entra cada
 * modulo. Mantiene el titulo sincronizado con el `data` de la ruta activa.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, RippleDirective],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly auth = inject(AuthService);
  protected readonly pulse = inject(PlatformPulseService);
  protected readonly tenantService = inject(TenantService);
  protected readonly toasts = inject(ToastService);

  protected readonly nav = NAV;
  /**
   * Oculta las paginas que pageGuard bloquearia (modulo apagado o rol que no
   * las usa) y, si el usuario tiene un rol personalizado, recorta ademas a sus
   * paginas permitidas (siempre deja "dashboard": es el destino del login y
   * perderlo dejaria al usuario sin pantalla de aterrizaje).
   */
  protected readonly visibleNav = computed(() => {
    const role = this.auth.role();
    const tenant = this.tenantService.tenant();
    const permissions = this.tenantService.effectivePermissions();
    const allowed = permissions ? new Set([...permissions, 'dashboard']) : null;
    return this.nav
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (i) => canAccessPage(i.path, role, tenant) && (!allowed || allowed.has(i.path)),
        ),
      }))
      .filter((section) => section.items.length > 0);
  });

  protected readonly navSearch = signal('');
  protected readonly sidebarTheme = signal<'dark' | 'light'>(this.readSavedSidebarTheme());
  protected readonly hoveredTip = signal<{ label: string; top: number } | null>(null);
  private readonly sidebarSearchInput = viewChild<ElementRef<HTMLInputElement>>('sidebarSearchInput');

  protected readonly filteredNav = computed(() => {
    const term = normalize(this.navSearch());
    const sections = this.visibleNav();
    if (!term) {
      return sections;
    }
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (i) => normalize(i.label).includes(term) || normalize(section.label).includes(term),
        ),
      }))
      .filter((section) => section.items.length > 0);
  });

  protected readonly collapsed = signal(false);
  protected readonly mobileOpen = signal(false);
  protected readonly scrolled = signal(false);
  protected readonly showToTop = signal(false);
  protected readonly scrollProgress = signal(0);
  protected readonly loggingOut = signal(false);
  protected readonly logoutName = signal('');
  protected readonly tenant = this.tenantService.tenant;

  private logoutTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly title = signal('Dashboard gerencial');
  protected readonly subtitle = signal('Resumen operativo del proveedor');

  protected readonly tenantPlan = computed(() => {
    const t = this.tenant();
    if (t) {
      return `${tenantPlanLabel(t.plan).text} · ${t.slug}`;
    }
    return this.auth.tenantSlug() ?? (this.auth.role() === 'SUPER_ADMIN' ? 'Plataforma' : 'Sin tenant');
  });

  protected readonly tenantInitials = computed(() => {
    const name = this.tenant()?.name ?? this.auth.tenantSlug() ?? 'DD';
    const parts = name.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? 'D') + (parts[1]?.[0] ?? parts[0]?.[1] ?? 'D')).toUpperCase();
  });

  private readonly mobileBreakpoint = 1024;

  constructor() {
    effect(() => {
      document.body.classList.toggle('sidebar-open', this.mobileOpen());
    });
    this.destroyRef.onDestroy(() => {
      document.body.classList.remove('sidebar-open');
      if (this.logoutTimer !== null) {
        clearTimeout(this.logoutTimer);
      }
    });
  }

  ngOnInit(): void {
    this.syncHeader();
    this.pulse.refresh();
    this.tenantService.refresh();

    const sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.syncHeader();
        this.mobileOpen.set(false);
        this.pulse.refresh();
        // si otra pestana o un admin cambio un modulo, lo refleja al navegar
        this.tenantService.refresh();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  protected counterValue(counter: NavCounter): number {
    return this.pulse.counters()[counter];
  }

  protected toggleSidebar(): void {
    this.hoveredTip.set(null);
    if (window.innerWidth <= this.mobileBreakpoint) {
      this.mobileOpen.update((v) => !v);
    } else {
      this.collapsed.update((v) => !v);
    }
  }

  protected setSidebarTheme(theme: 'dark' | 'light'): void {
    this.sidebarTheme.set(theme);
    try {
      localStorage.setItem(SIDEBAR_THEME_KEY, theme);
    } catch {
      // Modo privado / almacenamiento no disponible
    }
  }

  protected toggleSidebarTheme(): void {
    this.setSidebarTheme(this.sidebarTheme() === 'dark' ? 'light' : 'dark');
  }

  protected focusSidebarSearch(): void {
    if (this.collapsed() && window.innerWidth > this.mobileBreakpoint) {
      this.collapsed.set(false);
      this.hoveredTip.set(null);
      setTimeout(() => this.sidebarSearchInput()?.nativeElement.focus(), 220);
      return;
    }
    this.sidebarSearchInput()?.nativeElement.focus();
  }

  protected showNavTip(label: string, event: Event): void {
    if (!this.collapsed() || window.innerWidth <= this.mobileBreakpoint) {
      return;
    }
    const target = event.currentTarget as HTMLElement | null;
    if (!target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    this.hoveredTip.set({ label, top: rect.top + rect.height / 2 });
  }

  protected hideNavTip(): void {
    this.hoveredTip.set(null);
  }

  private readSavedSidebarTheme(): 'dark' | 'light' {
    try {
      return localStorage.getItem(SIDEBAR_THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }

  protected closeMobileSidebar(): void {
    this.mobileOpen.set(false);
  }

  @HostListener('window:resize')
  protected onResize(): void {
    if (window.innerWidth > this.mobileBreakpoint && this.mobileOpen()) {
      this.mobileOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.mobileOpen()) {
      this.mobileOpen.set(false);
    }
  }

  protected logout(): void {
    if (this.loggingOut()) {
      return;
    }
    this.mobileOpen.set(false);
    this.logoutName.set(this.auth.user()?.fullName ?? '');
    this.loggingOut.set(true);

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const durationMs = reduceMotion ? 350 : 1900;

    this.logoutTimer = setTimeout(() => {
      this.auth.logout();
    }, durationMs);
  }

  protected toTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Luz que sigue al cursor sobre las tarjetas. Va aqui, con un solo listener
   * en documento, porque una directiva con selector `.card` no alcanzaria las
   * plantillas de los componentes hijos.
   */
  @HostListener('document:mousemove', ['$event'])
  protected onMouseMove(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const card = target?.closest?.('.card') as HTMLElement | null;
    if (!card) {
      return;
    }
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    card.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }

  @HostListener('window:scroll')
  protected onScroll(): void {
    const y = window.scrollY;
    if (!this.scrolled() && y > 16) {
      this.scrolled.set(true);
    } else if (this.scrolled() && y < 4) {
      this.scrolled.set(false);
    }
    if (!this.showToTop() && y > 260) {
      this.showToTop.set(true);
    } else if (this.showToTop() && y < 180) {
      this.showToTop.set(false);
    }
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    this.scrollProgress.set(limit > 0 ? Math.min(y / limit, 1) : 0);
  }

  private syncHeader(): void {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    const data = route.data as { title?: string; subtitle?: string };
    if (data.title) {
      this.title.set(data.title);
    }
    this.subtitle.set(data.subtitle ?? '');
  }
}
