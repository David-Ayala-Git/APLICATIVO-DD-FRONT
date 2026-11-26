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
  WorkOrderStatus,
  WorkOrderType,
} from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { TablePagerComponent } from '../../shared/components/table-pager.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { durationLabel, initials, normalize } from '../../shared/format';
import {
  technicianStatusLabel,
  workOrderStatusLabel,
  workOrderTypeLabel,
} from '../../shared/labels';
import { paginate } from '../../shared/pagination';

const ORDER_ICONS: Record<WorkOrderType, string> = {
  INSTALLATION: 'fas fa-plug',
  REPAIR: 'fas fa-screwdriver-wrench',
  MAINTENANCE: 'fas fa-tower-broadcast',
  DISCONNECTION: 'fas fa-link-slash',
};

type OrderStatusFilter = WorkOrderStatus | 'ALL' | 'ACTIVE';
type OrderTypeFilter = WorkOrderType | 'ALL';

/**
 * Cuadrilla y ordenes de trabajo en campo: creacion, edicion, eliminacion,
 * control de inicio/terminacion con duracion, busqueda y paginacion. dd_ms_support.
 */
@Component({
  selector: 'app-technicians',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PageHeadComponent,
    AsyncStateComponent,
    ModalComponent,
    TablePagerComponent,
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

  protected readonly techSearch = signal('');
  protected readonly orderSearch = signal('');
  protected readonly orderStatusFilter = signal<OrderStatusFilter>('ALL');
  protected readonly orderTypeFilter = signal<OrderTypeFilter>('ALL');

  protected readonly addingTechnician = signal(false);
  protected readonly orderModalOpen = signal(false);
  protected readonly editingOrder = signal<WorkOrder | null>(null);
  protected readonly deletingOrder = signal<WorkOrder | null>(null);
  protected readonly saving = signal(false);
  protected readonly busyId = signal<string | null>(null);

  protected readonly orderTypes: { value: WorkOrderType; text: string }[] = [
    { value: 'INSTALLATION', text: 'Instalacion' },
    { value: 'REPAIR', text: 'Soporte / reparacion' },
    { value: 'MAINTENANCE', text: 'Mantenimiento' },
    { value: 'DISCONNECTION', text: 'Retiro' },
  ];

  protected readonly orderStatusFilters: { value: OrderStatusFilter; text: string }[] = [
    { value: 'ALL', text: 'Todas' },
    { value: 'ACTIVE', text: 'Pendientes' },
    { value: 'SCHEDULED', text: 'Agendadas' },
    { value: 'IN_PROGRESS', text: 'En curso' },
    { value: 'COMPLETED', text: 'Completadas' },
    { value: 'CANCELLED', text: 'Canceladas' },
  ];

  protected readonly editableOrderStatuses: { value: WorkOrderStatus; text: string }[] = [
    { value: 'SCHEDULED', text: 'Agendada' },
    { value: 'IN_PROGRESS', text: 'En curso' },
    { value: 'COMPLETED', text: 'Completada' },
    { value: 'CANCELLED', text: 'Cancelada' },
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
    status: ['SCHEDULED' as WorkOrderStatus, Validators.required],
  });

  protected readonly crewStats = computed(() => {
    const all = this.technicians.value();
    return {
      total: all.length,
      available: all.filter((t) => t.status === 'AVAILABLE').length,
      busy: all.filter((t) => t.status === 'BUSY').length,
    };
  });

  protected readonly filteredTechnicians = computed(() => {
    const term = normalize(this.techSearch());
    if (!term) {
      return this.technicians.value();
    }
    return this.technicians.value().filter((t) =>
      [t.fullName, t.phone].map((v) => normalize(v)).some((v) => v.includes(term)),
    );
  });

  protected readonly techPager = paginate(this.filteredTechnicians, 10);

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

  protected readonly filteredOrders = computed(() => {
    const term = normalize(this.orderSearch());
    const status = this.orderStatusFilter();
    const type = this.orderTypeFilter();
    return this.orders
      .value()
      .filter((o) => {
        if (status === 'ACTIVE') {
          if (o.status !== 'SCHEDULED' && o.status !== 'IN_PROGRESS') {
            return false;
          }
        } else if (status !== 'ALL' && o.status !== status) {
          return false;
        }
        if (type !== 'ALL' && o.type !== type) {
          return false;
        }
        if (!term) {
          return true;
        }
        return [
          workOrderTypeLabel(o.type).text,
          this.clientName(o.clientId),
          this.technicianName(o.technicianId),
          o.address,
        ]
          .map((v) => normalize(v))
          .some((v) => v.includes(term));
      })
      .sort((a, b) => ((a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1));
  });

  protected readonly ordersPager = paginate(this.filteredOrders, 10);

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
    const firstClient = this.clients.value()[0];
    this.editingOrder.set(null);
    this.orderForm.reset({
      clientId: firstClient?.id ?? '',
      type: 'INSTALLATION',
      technicianId: this.technicians.value().find((t) => t.status === 'AVAILABLE')?.id ?? '',
      ticketId: '',
      date: today(),
      time: '08:30',
      address: firstClient?.address ?? '',
      status: 'SCHEDULED',
    });
    this.orderModalOpen.set(true);
  }

  protected openEditOrder(order: WorkOrder): void {
    const { date, time } = splitLocalDateTime(order.scheduledAt);
    this.editingOrder.set(order);
    this.orderForm.reset({
      clientId: order.clientId,
      type: order.type,
      technicianId: order.technicianId ?? '',
      ticketId: order.ticketId ?? '',
      date,
      time,
      address: order.address ?? '',
      status: order.status,
    });
    this.orderModalOpen.set(true);
  }

  protected confirmDeleteOrder(order: WorkOrder): void {
    this.deletingOrder.set(order);
  }

  /** Al elegir cliente precargamos su direccion: casi siempre es la de la visita. */
  protected onClientChange(clientId: string): void {
    const client = this.clients.value().find((c) => c.id === clientId);
    this.orderForm.controls.address.setValue(client?.address ?? '');
  }

  protected closeModals(): void {
    this.addingTechnician.set(false);
    this.orderModalOpen.set(false);
    this.editingOrder.set(null);
    this.deletingOrder.set(null);
  }

  protected saveTechnician(): void {
    if (this.technicianForm.invalid || this.saving()) {
      this.technicianForm.markAllAsTouched();
      return;
    }
    const raw = this.technicianForm.getRawValue();
    this.saving.set(true);
    this.api
      .createTechnician({ fullName: raw.fullName.trim(), phone: raw.phone.trim() || null })
      .subscribe({
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
    const scheduledIso = raw.date && raw.time ? new Date(`${raw.date}T${raw.time}`).toISOString() : null;
    const current = this.editingOrder();
    this.saving.set(true);

    const request$ = current
      ? this.api.updateWorkOrder(current.id, {
          clientId: raw.clientId,
          type: raw.type,
          technicianId: raw.technicianId || null,
          ticketId: raw.ticketId || null,
          scheduledAt: scheduledIso,
          address: raw.address.trim() || null,
          status: raw.status,
        })
      : this.api.createWorkOrder({
          clientId: raw.clientId,
          type: raw.type,
          technicianId: raw.technicianId || null,
          ticketId: raw.ticketId || null,
          scheduledAt: scheduledIso,
          address: raw.address.trim() || null,
        });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.orderModalOpen.set(false);
        this.editingOrder.set(null);
        this.toast.success(
          current ? 'Orden de trabajo actualizada.' : 'Orden de trabajo agendada y guardada.',
        );
        this.orders.reload();
        this.technicians.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected removeOrder(): void {
    const target = this.deletingOrder();
    if (!target || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.deleteWorkOrder(target.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.deletingOrder.set(null);
        this.toast.success('Orden de trabajo eliminada.');
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

  protected startOrder(order: WorkOrder): void {
    this.runOrderAction(
      order.id,
      this.api.startWorkOrder(order.id),
      'Orden iniciada. Se registro la fecha y hora de inicio.',
    );
  }

  protected finishOrder(order: WorkOrder): void {
    this.runOrderAction(
      order.id,
      this.api.finishWorkOrder(order.id),
      'Orden terminada. Se registro la hora de finalizacion y duracion.',
    );
  }

  private runOrderAction(
    id: string,
    request$: ReturnType<SupportApi['startWorkOrder']>,
    message: string,
  ): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(id);
    request$.subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success(message);
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
  protected readonly durationLabel = durationLabel;
  protected readonly statusLabel = technicianStatusLabel;
  protected readonly orderStatusLabel = workOrderStatusLabel;
  protected readonly orderTypeLabel = workOrderTypeLabel;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function splitLocalDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) {
    return { date: today(), time: '08:30' };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { date: today(), time: '08:30' };
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
