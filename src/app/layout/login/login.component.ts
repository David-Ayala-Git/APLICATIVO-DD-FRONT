import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { describeHttpError } from '../../core/ui/http-error';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { FiberCanvasComponent } from './fiber-canvas.component';

/**
 * Ingreso a la consola. Al autenticarse con exito reproduce la animacion de
 * bienvenida donde las dos "D" del logo se unen en el emblema D&D antes de
 * entrar al tablero principal.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, FiberCanvasComponent, RippleDirective],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  private navTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly submitting = signal(false);
  protected readonly welcomeAnimating = signal(false);
  protected readonly welcomeName = signal('');
  protected readonly mobileStep = signal<'welcome' | 'form'>('welcome');
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly modules = [
    { icon: 'fas fa-users', text: 'CRM de clientes' },
    { icon: 'fas fa-file-invoice-dollar', text: 'Facturacion' },
    { icon: 'fas fa-network-wired', text: 'MikroTik' },
    { icon: 'fas fa-satellite-dish', text: 'GPON (OLT/ONU)' },
    { icon: 'fas fa-map-marked-alt', text: 'Cobertura y mapas' },
    { icon: 'fab fa-whatsapp', text: 'WhatsApp Business' },
    { icon: 'fas fa-robot', text: 'Agentes de IA' },
    { icon: 'fas fa-diagram-project', text: 'Automatizacion n8n' },
  ];

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.navTimer !== null) {
        clearTimeout(this.navTimer);
      }
    });
  }

  protected togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected goToForm(): void {
    this.mobileStep.set('form');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  protected goToWelcome(): void {
    this.mobileStep.set('welcome');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: (res) => {
        const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') ?? '/app/dashboard';
        this.welcomeName.set(res.user?.fullName ?? '');
        this.welcomeAnimating.set(true);

        const reduceMotion =
          typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const durationMs = reduceMotion ? 350 : 1900;

        this.navTimer = setTimeout(() => {
          void this.router.navigateByUrl(redirectTo);
        }, durationMs);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.error.set(describeHttpError(err, 'login'));
      },
    });
  }
}
