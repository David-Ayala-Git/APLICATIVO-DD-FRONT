import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { CrmApi, SupportApi } from '../../core/api';
import { Client, Priority, Technician, Ticket, TicketStatus } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { initials, normalize, slaCountdown } from '../../shared/format';
import { priorityLabel, ticketStatusLabel } from '../../shared/labels';

type StatusFilter = TicketStatus | 'ALL' | 'OPEN_ALL';

/** Mesa de ayuda: tickets con SLA, asignacion y cierre. dd_ms_support. */
@Component({
  selector: 'app-tickets',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PageHeadComponent,
    StatCardComponent,
    StatusBadgeComponent,
    AsyncStateComponent,
    ModalComponent,
    RippleDirective,
  ],
  templateUrl: './tickets.component.html',
})
export class TicketsComponent {
  private readonly api = inject(SupportApi);
  private readonly crm = inject(CrmApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly tickets = collection(() => this.api.tickets(), [] as Ticket[]);
  protected readonly technicians = collection(
    () => this.api.technicians().pipe(catchError(() => of([] as Technician[]))),
    [] as Technician[],
  );
  protected readonly clients = collection(
    () => this.crm.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );

  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('OPEN_ALL');
  protected readonly creating = signal(false);
  protected readonly assigningTo = signal<Ticket | null>(null);
  protected readonly saving = signal(false);
  protected readonly busyId = signal<string | null>(null);

  protected readonly statusOptions: { value: StatusFilter; text: string }[] = [
    { value: 'OPEN_ALL', text: 'Sin resolver' },
    { value: 'ALL', text: 'Todos' },
    { value: 'OPEN', text: 'Abiertos' },
    { value: 'IN_PROGRESS', text: 'En proceso' },
    { value: 'RESOLVED', text: 'Resueltos' },
    { value: 'CLOSED', text: 'Cerrados' },
  ];

  protected readonly priorities: { value: Priority; text: string }[] = [
    { value: 'LOW', text: 'Baja' },
    { value: 'MEDIUM', text: 'Media' },
    { value: 'HIGH', text: 'Alta' },
    { value: 'URGENT', text: 'Urgente' },
  ];

  protected readonly reasons = [
    'Sin servicio',
    'Lentitud en horas pico',
    'Senal optica baja (LOS)',
    'Cambio de plan',
    'Traslado de domicilio',
    'Consulta de facturacion',
    'Reclamo de cobro',
  ];

  protected readonly form = this.fb.nonNullable.group({
    clientId: ['', Validators.required],
    reason: ['Sin servicio', Validators.required],
    priority: ['MEDIUM' as Priority, Validators.required],
  });

  protected readonly assignForm = this.fb.nonNullable.group({
    technicianId: ['', Validators.required],
  });

  protected readonly stats = computed(() => {
    const all = this.tickets.value();
    const unresolved = all.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
    return {
      urgent: unresolved.filter((t) => t.priority === 'URGENT').length,
      open: all.filter((t) => t.status === 'OPEN').length,
      inProgress: all.filter((t) => t.status === 'IN_PROGRESS').length,
      resolved: all.filter((t) => t.status === 'RESOLVED').length,
      /** SLA ya incumplido entre los que siguen sin resolver. */
      breached: unresolved.filter((t) => t.slaDueAt && new Date(t.slaDueAt).getTime() < Date.now())
        .length,
    };
  });

  protected readonly filtered = computed(() => {
    const term = normalize(this.search());
    const status = this.statusFilter();
    return this.tickets
      .value()
      .filter((ticket) => {
        if (status === 'OPEN_ALL') {
          if (ticket.status !== 'OPEN' && ticket.status !== 'IN_PROGRESS') {
            return false;
          }
        } else if (status !== 'ALL' && ticket.status !== status) {
          return false;
        }
        if (!term) {
          return true;
        }
        return [ticket.reason, this.clientName(ticket.clientId), this.technicianName(ticket.assignedTo)]
          .map((v) => normalize(v))
          .some((v) => v.includes(term));
      })
      .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));
  });

  protected clientName(clientId: string): string {
    return this.clients.value().find((c) => c.id === clientId)?.fullName ?? 'Cliente';
  }

  protected technicianName(technicianId: string | null): string {
    if (!technicianId) {
      return '';
    }
    return this.technicians.value().find((t) => t.id === technicianId)?.fullName ?? 'Tecnico';
  }

  protected openCreate(): void {
    this.form.reset({
      clientId: this.clients.value()[0]?.id ?? '',
      reason: 'Sin servicio',
      priority: 'MEDIUM',
    });
    this.creating.set(true);
  }

  protected openAssign(ticket: Ticket): void {
    const available = this.technicians.value().find((t) => t.status === 'AVAILABLE');
    this.assignForm.reset({
      technicianId: available?.id ?? this.technicians.value()[0]?.id ?? '',
    });
    this.assigningTo.set(ticket);
  }

  protected closeModals(): void {
    this.creating.set(false);
    this.assigningTo.set(null);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api.createTicket(this.form.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false);
        this.creating.set(false);
        this.toast.success('Ticket creado con su SLA asignado.');
        this.tickets.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected assign(): void {
    const ticket = this.assigningTo();
    if (!ticket || this.assignForm.invalid || this.saving()) {
      this.assignForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api.assignTicket(ticket.id, this.assignForm.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false);
        this.assigningTo.set(null);
        this.toast.success('Ticket asignado al tecnico.');
        this.tickets.reload();
        this.technicians.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected resolve(ticket: Ticket): void {
    this.run(ticket.id, this.api.resolveTicket(ticket.id), 'Ticket resuelto.');
  }

  protected closeTicket(ticket: Ticket): void {
    this.run(ticket.id, this.api.closeTicket(ticket.id), 'Ticket cerrado.');
  }

  private run(id: string, request$: ReturnType<SupportApi['resolveTicket']>, message: string): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(id);
    request$.subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success(message);
        this.tickets.reload();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected readonly initials = initials;
  protected readonly sla = slaCountdown;
  protected readonly statusLabel = ticketStatusLabel;
  protected readonly priorityLabel = priorityLabel;
}

function priorityWeight(priority: string): number {
  return { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[priority] ?? 0;
}
