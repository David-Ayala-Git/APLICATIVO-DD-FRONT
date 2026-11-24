import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { NetworkApi } from '../../core/api';
import { NetworkNode, NodeType } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { nodeStatusLabel, nodeTypeLabel } from '../../shared/labels';

const NODE_ICONS: Record<NodeType, string> = {
  POP: 'fas fa-tower-broadcast',
  NAP: 'fas fa-box',
  OLT_SITE: 'fas fa-satellite-dish',
  TOWER: 'fas fa-broadcast-tower',
};

/**
 * Cobertura: nodos, cajas NAP y torres sobre un plano relativo.
 * El plano se dibuja normalizando lat/lon al cuadro: suficiente para ver la
 * topologia sin arrastrar una libreria de mapas ni una API key.
 */
@Component({
  selector: 'app-coverage',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PageHeadComponent,
    StatusBadgeComponent,
    AsyncStateComponent,
    ModalComponent,
    RippleDirective,
  ],
  templateUrl: './coverage.component.html',
})
export class CoverageComponent {
  private readonly api = inject(NetworkApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly nodes = collection(() => this.api.nodes(), [] as NetworkNode[]);

  protected readonly creating = signal(false);
  protected readonly saving = signal(false);

  protected readonly nodeTypes: { value: NodeType; text: string }[] = [
    { value: 'POP', text: 'POP / nodo de distribucion' },
    { value: 'NAP', text: 'Caja NAP' },
    { value: 'OLT_SITE', text: 'Sitio de OLT' },
    { value: 'TOWER', text: 'Torre / antena' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    type: ['NAP' as NodeType, Validators.required],
    latitude: [1.2136, [Validators.required, Validators.min(-90), Validators.max(90)]],
    longitude: [-77.2811, [Validators.required, Validators.min(-180), Validators.max(180)]],
  });

  protected readonly byType = computed(() => {
    const all = this.nodes.value();
    return this.nodeTypes.map((t) => ({
      ...t,
      icon: NODE_ICONS[t.value],
      label: nodeTypeLabel(t.value),
      count: all.filter((n) => n.type === t.value).length,
      active: all.filter((n) => n.type === t.value && n.status === 'ACTIVE').length,
    }));
  });

  /**
   * Coordenadas llevadas a porcentaje del cuadro, con 8% de margen para que
   * los marcadores de los extremos no queden cortados.
   */
  protected readonly plotted = computed(() => {
    const all = this.nodes.value();
    if (all.length === 0) {
      return [];
    }
    const lats = all.map((n) => n.latitude);
    const lons = all.map((n) => n.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const spanLat = maxLat - minLat || 1;
    const spanLon = maxLon - minLon || 1;

    return all.map((node) => ({
      node,
      icon: NODE_ICONS[node.type],
      label: nodeTypeLabel(node.type),
      // la latitud crece hacia el norte y el eje Y de la pantalla hacia abajo
      top: 8 + ((maxLat - node.latitude) / spanLat) * 84,
      left: 8 + ((node.longitude - minLon) / spanLon) * 84,
    }));
  });

  protected openCreate(): void {
    this.form.reset({ name: '', type: 'NAP', latitude: 1.2136, longitude: -77.2811 });
    this.creating.set(true);
  }

  protected close(): void {
    this.creating.set(false);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api.createNode(this.form.getRawValue()).subscribe({
      next: (node) => {
        this.saving.set(false);
        this.creating.set(false);
        this.toast.success(`Nodo "${node.name}" registrado.`);
        this.nodes.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected readonly typeLabel = nodeTypeLabel;
  protected readonly statusLabel = nodeStatusLabel;
}
