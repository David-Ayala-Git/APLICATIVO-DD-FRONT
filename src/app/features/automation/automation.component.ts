import { Component } from '@angular/core';

import { environment } from '../../../environments/environment';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';

interface FlowStep {
  icon: string;
  title: string;
  detail: string;
  tone: 'violet' | 'cyan' | 'green' | 'orange' | 'red';
}

interface Recipe {
  icon: string;
  title: string;
  description: string;
  /** Flujo importable en infra/n8n/workflows; sin el, la receta es solo una idea. */
  file?: string;
  steps: FlowStep[];
}

/**
 * Automatizacion con n8n. n8n corre como contenedor aparte (puerto 5678) y no
 * expone datos al gateway, asi que esta pantalla documenta los flujos y los
 * endpoints que cada uno consume, y abre la consola de n8n. No inventa
 * contadores de ejecuciones que la plataforma no puede leer.
 */
@Component({
  selector: 'app-automation',
  imports: [PageHeadComponent, RippleDirective],
  templateUrl: './automation.component.html',
})
export class AutomationComponent {
  protected readonly n8nUrl = environment.n8nUrl;

  protected readonly recipes: Recipe[] = [
    {
      icon: 'fas fa-bolt',
      title: 'Corte por mora',
      file: 'corte-por-mora.json',
      description:
        'Cada manana marca las facturas vencidas y corta en el router a los clientes activos que tienen router y usuario PPPoE en su ficha. Luego los marca suspendidos y les avisa.',
      steps: [
        { icon: 'fas fa-clock', title: 'Cron diario', detail: '06:00', tone: 'cyan' },
        {
          icon: 'fas fa-file-invoice-dollar',
          title: 'POST /api/billing/overdue',
          detail: 'marca y trae vencidas',
          tone: 'violet',
        },
        {
          icon: 'fas fa-ban',
          title: 'POST /api/network/routers/{id}/cut',
          detail: 'secret PPPoE',
          tone: 'red',
        },
        {
          icon: 'fas fa-user-slash',
          title: 'POST /api/crm/clients/{id}/status',
          detail: 'SUSPENDED',
          tone: 'orange',
        },
        {
          icon: 'fab fa-whatsapp',
          title: 'POST /api/whatsapp/send',
          detail: 'aviso_corte',
          tone: 'green',
        },
      ],
    },
    {
      icon: 'fas fa-plug-circle-check',
      title: 'Reactivacion por pago',
      file: 'reactivacion-por-pago.json',
      description:
        'Facturacion avisa a n8n cuando se confirma un pago; si el cliente estaba suspendido, se reconecta y se le confirma.',
      steps: [
        {
          icon: 'fas fa-credit-card',
          title: 'Evento payment-confirmed',
          detail: 'desde dd_ms_billing',
          tone: 'violet',
        },
        {
          icon: 'fas fa-plug',
          title: 'POST /api/network/routers/{id}/enable',
          detail: 'secret PPPoE',
          tone: 'cyan',
        },
        {
          icon: 'fas fa-user-check',
          title: 'POST /api/crm/clients/{id}/status',
          detail: 'ACTIVE',
          tone: 'orange',
        },
        {
          icon: 'fab fa-whatsapp',
          title: 'POST /api/whatsapp/send',
          detail: 'confirmacion_pago',
          tone: 'green',
        },
      ],
    },
    {
      icon: 'fas fa-user-plus',
      title: 'Alta de cliente nuevo',
      file: 'onboarding-cliente.json',
      description:
        'Al crear el cliente en el CRM, agenda la instalacion y le da la bienvenida. La autorizacion de la ONU se agregara cuando GPON este integrado.',
      steps: [
        {
          icon: 'fas fa-user-plus',
          title: 'Evento client-created',
          detail: 'desde dd_ms_crm',
          tone: 'violet',
        },
        {
          icon: 'fas fa-calendar-check',
          title: 'POST /api/technicians/orders',
          detail: 'INSTALLATION',
          tone: 'orange',
        },
        {
          icon: 'fab fa-whatsapp',
          title: 'POST /api/whatsapp/send',
          detail: 'bienvenida',
          tone: 'green',
        },
      ],
    },
    {
      icon: 'fas fa-bell',
      title: 'Recordatorio antes del vencimiento',
      description:
        'Tres dias antes de la fecha de pago, envia el recordatorio solo a quien tiene factura pendiente.',
      steps: [
        { icon: 'fas fa-clock', title: 'Cron diario', detail: '08:00', tone: 'cyan' },
        {
          icon: 'fas fa-magnifying-glass-dollar',
          title: 'GET /api/billing/invoices',
          detail: 'vence en 3 dias',
          tone: 'violet',
        },
        {
          icon: 'fab fa-whatsapp',
          title: 'POST /api/whatsapp/send',
          detail: 'recordatorio',
          tone: 'green',
        },
      ],
    },
    {
      icon: 'fas fa-triangle-exclamation',
      title: 'Alerta de senal optica degradada',
      description:
        'Revisa las potencias de las ONUs y abre un ticket urgente cuando una baja de -27 dBm.',
      steps: [
        { icon: 'fas fa-clock', title: 'Cron cada hora', detail: 'monitoreo', tone: 'cyan' },
        {
          icon: 'fas fa-wifi',
          title: 'GET /api/gpon/onu',
          detail: 'rxPower < -27',
          tone: 'orange',
        },
        {
          icon: 'fas fa-headset',
          title: 'POST /api/tickets',
          detail: 'prioridad URGENT',
          tone: 'red',
        },
      ],
    },
  ];
}
