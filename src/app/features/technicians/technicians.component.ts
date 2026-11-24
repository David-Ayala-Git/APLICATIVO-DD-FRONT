import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { CrmApi, SupportApi } from '../../core/api';
import {
  Client,
  Technician,
  TechnicianStatus,
  Ticket,
  WorkOrder,
  WorkOrderType,
} from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { initials } from '../../shared/format';
import {
  technicianStatusLabel,
  workOrderStatusLabel,
  workOrderTypeLabel,
} from '../../shared/labels';

const ORDER_ICONS: Record<WorkOrderType, string> = {
  INSTALLATION: 'fas fa-plug',
  REPAIR: 'fas fa-screwdriver-wrench',
  MAINTENANCE: 'fas fa-tower-broadcast',
  DISCONNECTION: 'fas fa-link-slash',
};

/** Cuadrilla y ordenes de trabajo en campo. dd_ms_support. */
@Component({
  selector: 'app-technicians',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PageHeadComponent,
    AsyncStateComponent,
    ModalComponent,
    RippleDirective,
  ],
  templateUrl: './technicians.component.html',
})
export class TechniciansComponent {
  private readonly api = inject(SupportApi);
  private readonly crm = inject(CrmApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly technicians = collection(() => this.api.technicians(), [] as Technician[]);
  protected readonly orders = collection(() => this.api.workOrders(), [] as WorkOrder[]);
  protected readonly tickets = collection(
    () => this.api.tickets().pipe(catchError(() => of([] as Ticket[]))),
    [] as Ticket[],
  );
  protected readonly clients = collection(
    () => this.crm.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );

  protected readonly addingTechnician = signal(false);
  protected readonly addingOrder = signal(false);
  protected readonly saving = signal(false);
  protected readonly busyId = signal<string | null>(null);

  protected readonly orderTypes: { value: WorkOrderType; text: string }[] = [
    { value: 'INSTALLATION', text: 'Instalacion' },
    { value: 'REPAIR', text: 'Soporte / reparacion' },
    { value: 'MAINTENANCE', text: 'Mantenimiento' },
    { value: 'DISCONNECTION', text: 'Retiro' },
  ];

  protected readonly statuses: { value: TechnicianStatus; text: string }[] = [
    { value: 'AVAILABLE', text: 'Disponible' },
    { value: 'BUSY', text: 'En ruta' },
    { value: 'OFF', text: 'Descanso' },
  ];

  protected readonly technicianForm = this.fb.nonNullable.group({
    fullName: ['', Validators.required],
    phone: [''],
  });

  protected readonly orderForm = this.fb.nonNullable.group({
    clientId: ['', Validators.required],
    type: ['INSTALLATION' as WorkOrderType, Validators.required],
    technicianId: [''],
    ticketId: [''],
    date: [today(), Validators.required],
    time: ['08:30', Validators.required],
    address: [''],
  });

  protected readonly crewStats = computed(() => {
    const all = this.technicians.value();
    return {
      total: all.length,
      available: all.filter((t) => t.status === 'AVAILABLE').length,
      busy: all.filter((t) => t.status === 'BUSY').length,
    };
  });

  /** Ordenes de hoy, que es lo que se reparte en la reunion de la manana. */
  protected readonly todayOrders = computed(() => {
    const now = new Date();
    return this.orders
      .value()
      .filter((o) => {
        if (!o.scheduledAt) {
          return false;
        }
        const d = new Date(o.scheduledAt);
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      })
      .sort((a, b) => ((a.scheduledAt ?? '') > (b.scheduledAt ?? '') ? 1 : -1));
  });

  protected readonly pendingOrders = computed(() =>
    this.orders
      .value()
      .filter((o) => o.status === 'SCHEDULED' || o.status === 'IN_PROGRESS')
      .sort((a, b) => ((a.scheduledAt ?? '') > (b.scheduledAt ?? '') ? 1 : -1)),
  );

  /** Solo tickets que siguen vivos: enlazar una orden a uno cerrado no aporta. */
  protected readonly openTickets = computed(() =>
    this.tickets.value().filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS'),
  );

  protected clientName(clientId: string): string {
    return this.clients.value().find((c) => c.id === clientId)?.fullName ?? 'Cliente';
  }

  protected technicianName(technicianId: string | null): string {
    if (!technicianId) {
      return 'Sin asignar';
    }
    return this.technicians.value().find((t) => t.id === technicianId)?.fullName ?? 'Tecnico';
  }

  protected orderIcon(type: WorkOrderType): string {
    return ORDER_ICONS[type];
  }

  protected openAddTechnician(): void {
    this.technicianForm.reset({ fullName: '', phone: '' });
    this.addingTechnician.set(true);
  }

  protected openAddOrder(): void {
    this.orderForm.reset({
      clientId: this.clients.value()[0]?.id ?? '',
      type: 'INSTALLATION',
      technicianId: this.technicians.value().find((t) => t.status === 'AVAILABLE')?.id ?? '',
      ticketId: '',
      date: today(),
      time: '08:30',
      address: '',
    });
    this.addingOrder.set(true);
  }

  /** Al elegir cliente precargamos su direccion: casi siempre es la de la visita. */
  protected onClientChange(clientId: string): void {
    const client = this.clients.value().find((c) => c.id === clientId);
    this.orderForm.controls.address.setValue(client?.address ?? '');
  }

  protected closeModals(): void {
    this.addingTechnician.set(false);
    this.addingOrder.set(false);
  }

  protected saveTechnician(): void {
    if (this.technicianForm.invalid || this.saving()) {
      this.technicianForm.markAllAsTouched();
      return;
    }
    const raw = this.technicianForm.getRawValue();
    this.saving.set(true);
    this.api.createTechnician({ fullName: raw.fullName, phone: raw.phone || null }).subscribe({
      next: () => {
        this.saving.set(false);
        this.addingTechnician.set(false);
        this.toast.success('Tecnico agregado a la cuadrilla.');
        this.technicians.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected saveOrder(): void {
    if (this.orderForm.invalid || this.saving()) {
      this.orderForm.markAllAsTouched();
      return;
    }
    const raw = this.orderForm.getRawValue();
    this.saving.set(true);
    this.api
      .createWorkOrder({
        clientId: raw.clientId,
        type: raw.type,
        technicianId: raw.technicianId || null,
        ticketId: raw.ticketId || null,
        // el backend espera OffsetDateTime: toISOString da el instante en UTC
        scheduledAt: new Date(`${raw.date}T${raw.time}`).toISOString(),
        address: raw.address || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.addingOrder.set(false);
          this.toast.success('Orden de trabajo agendada.');
          this.orders.reload();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  protected setStatus(tech: Technician, status: TechnicianStatus): void {
    if (this.busyId() || tech.status === status) {
      return;
    }
    this.busyId.set(tech.id);
    this.api.updateTechnicianStatus(tech.id, { status }).subscribe({
      next: () => {
        this.busyId.set(null);
        this.technicians.reload();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected complete(order: WorkOrder): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(order.id);
    this.api.completeWorkOrder(order.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success('Orden marcada como completada.');
        this.orders.reload();
        this.technicians.reload();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected readonly initials = initials;
  protected readonly statusLabel = technicianStatusLabel;
  protected readonly orderStatusLabel = workOrderStatusLabel;
  protected readonly orderTypeLabel = workOrderTypeLabel;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
