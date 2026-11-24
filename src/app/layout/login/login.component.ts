import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { describeHttpError } from '../../core/ui/http-error';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { FiberCanvasComponent } from './fiber-canvas.component';

/**
 * Ingreso a la consola. El proveedor (tenant) no se elige aqui: viene en el
 * claim del JWT que emite dd_ms_auth a partir del usuario, y el gateway lo
 * reescribe en cada peticion. Un correo pertenece a un solo ISP.
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

  protected readonly submitting = signal(false);
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

  protected togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => {
        const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
        void this.router.navigateByUrl(redirectTo ?? '/app/dashboard');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.error.set(describeHttpError(err, 'login'));
      },
    });
  }
}
