import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { CrmApi, NetworkApi } from '../../core/api';
import { Client, Equipment, EquipmentStatus, EquipmentType } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { TablePagerComponent } from '../../shared/components/table-pager.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { normalize } from '../../shared/format';
import { equipmentStatusLabel, equipmentTypeLabel } from '../../shared/labels';
import { paginate } from '../../shared/pagination';

type StatusFilter = EquipmentStatus | 'ALL';
type TypeFilter = EquipmentType | 'ALL';

/** Inventario de equipos con series, edicion, eliminacion y asignacion a cliente. dd_ms_network. */
@Component({
  selector: 'app-inventory',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PageHeadComponent,
    StatCardComponent,
    AsyncStateComponent,
    ModalComponent,
    TablePagerComponent,
    RippleDirective,
  ],
  templateUrl: './inventory.component.html',
})
export class InventoryComponent {
  private readonly api = inject(NetworkApi);
  private readonly crm = inject(CrmApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly equipment = collection(() => this.api.equipment(), [] as Equipment[]);
  protected readonly clients = collection(
    () => this.crm.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );

  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('ALL');
  protected readonly typeFilter = signal<TypeFilter>('ALL');

  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<Equipment | null>(null);
  protected readonly deleting = signal<Equipment | null>(null);
  protected readonly assigning = signal<Equipment | null>(null);
  protected readonly saving = signal(false);

  protected readonly types: { value: EquipmentType; text: string }[] = [
    { value: 'ONT', text: 'ONU / ONT' },
    { value: 'ROUTER', text: 'Router' },
    { value: 'SWITCH', text: 'Switch' },
    { value: 'ANTENNA', text: 'Antena' },
    { value: 'OTHER', text: 'Otro' },
  ];

  protected readonly statusOptions: { value: StatusFilter; text: string }[] = [
    { value: 'ALL', text: 'Todos' },
    { value: 'IN_STOCK', text: 'En bodega' },
    { value: 'ASSIGNED', text: 'Asignados' },
    { value: 'FAULTY', text: 'Averiados' },
    { value: 'RETIRED', text: 'Dado de baja' },
  ];

  protected readonly equipmentStatuses: { value: EquipmentStatus; text: string }[] = [
    { value: 'IN_STOCK', text: 'Disponible en bodega' },
    { value: 'ASSIGNED', text: 'Asignado a cliente' },
    { value: 'FAULTY', text: 'Averiado' },
    { value: 'RETIRED', text: 'Dado de baja' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    type: ['ONT' as EquipmentType, Validators.required],
    brand: [''],
    model: [''],
    serialNumber: ['', Validators.required],
    status: ['IN_STOCK' as EquipmentStatus, Validators.required],
    assignedClientId: [''],
  });

  protected readonly assignForm = this.fb.nonNullable.group({
    clientId: ['', Validators.required],
  });

  protected readonly stats = computed(() => {
    const all = this.equipment.value();
    return {
      total: all.length,
      inStock: all.filter((e) => e.status === 'IN_STOCK').length,
      assigned: all.filter((e) => e.status === 'ASSIGNED').length,
      faulty: all.filter((e) => e.status === 'FAULTY').length,
    };
  });

  /** Resumen por tipo, que es lo que mira bodega antes de pedir reposicion. */
  protected readonly byType = computed(() => {
    const all = this.equipment.value();
    return this.types
      .map((t) => ({
        ...t,
        label: equipmentTypeLabel(t.value),
        total: all.filter((e) => e.type === t.value).length,
        inStock: all.filter((e) => e.type === t.value && e.status === 'IN_STOCK').length,
      }))
      .filter((row) => row.total > 0);
  });

  protected readonly filtered = computed(() => {
    const term = normalize(this.search());
    const status = this.statusFilter();
    const type = this.typeFilter();
    return this.equipment.value().filter((e) => {
      if (status !== 'ALL' && e.status !== status) {
        return false;
      }
      if (type !== 'ALL' && e.type !== type) {
        return false;
      }
      if (!term) {
        return true;
      }
      return [e.serialNumber, e.brand, e.model, this.clientName(e.assignedClientId)]
        .map((v) => normalize(v))
        .some((v) => v.includes(term));
    });
  });

  protected readonly pager = paginate(this.filtered, 10);

  protected clientName(clientId: string | null): string {
    if (!clientId) {
      return '';
    }
    return this.clients.value().find((c) => c.id === clientId)?.fullName ?? 'Cliente';
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form.reset({
      type: 'ONT',
      brand: '',
      model: '',
      serialNumber: '',
      status: 'IN_STOCK',
      assignedClientId: '',
    });
    this.modalOpen.set(true);
  }

  protected openEdit(item: Equipment): void {
    this.editing.set(item);
    this.form.reset({
      type: item.type,
      brand: item.brand ?? '',
      model: item.model ?? '',
      serialNumber: item.serialNumber,
      status: item.status,
      assignedClientId: item.assignedClientId ?? '',
    });
    this.modalOpen.set(true);
  }

  protected confirmDelete(item: Equipment): void {
    this.deleting.set(item);
  }

  protected openAssign(item: Equipment): void {
    this.assignForm.reset({ clientId: this.clients.value()[0]?.id ?? '' });
    this.assigning.set(item);
  }

  protected closeModals(): void {
    this.modalOpen.set(false);
    this.editing.set(null);
    this.deleting.set(null);
    this.assigning.set(null);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const current = this.editing();
    this.saving.set(true);

    const request$ = current
      ? this.api.updateEquipment(current.id, {
          type: raw.type,
          brand: raw.brand.trim() || null,
          model: raw.model.trim() || null,
          serialNumber: raw.serialNumber.trim(),
          status: raw.status,
          assignedClientId: raw.status === 'ASSIGNED' ? raw.assignedClientId || null : null,
        })
      : this.api.createEquipment({
          type: raw.type,
          brand: raw.brand.trim() || null,
          model: raw.model.trim() || null,
          serialNumber: raw.serialNumber.trim(),
        });

    request$.subscribe({
      next: (item) => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.editing.set(null);
        this.toast.success(
          current
            ? `Equipo ${item.serialNumber} actualizado.`
            : `Equipo ${item.serialNumber} ingresado a bodega.`,
        );
        this.equipment.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected removeEquipment(): void {
    const item = this.deleting();
    if (!item || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.deleteEquipment(item.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleting.set(null);
        this.toast.success(`Equipo ${item.serialNumber} eliminado.`);
        this.equipment.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected assign(): void {
    const item = this.assigning();
    if (!item || this.assignForm.invalid || this.saving()) {
      this.assignForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api.assignEquipment(item.id, this.assignForm.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false);
        this.assigning.set(null);
        this.toast.success('Equipo asignado al cliente.');
        this.equipment.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected readonly typeLabel = equipmentTypeLabel;
  protected readonly statusLabel = equipmentStatusLabel;
}
