import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { NetworkApi } from '../../core/api';
import { NetworkNode, NodeStatus, NodeType } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { TablePagerComponent } from '../../shared/components/table-pager.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { normalize } from '../../shared/format';
import { nodeStatusLabel, nodeTypeLabel } from '../../shared/labels';
import { paginate } from '../../shared/pagination';

const NODE_ICONS: Record<NodeType, string> = {
  POP: 'fas fa-tower-broadcast',
  NAP: 'fas fa-box',
  OLT_SITE: 'fas fa-satellite-dish',
  TOWER: 'fas fa-broadcast-tower',
};

const NODE_COLORS: Record<NodeType, string> = {
  POP: '#7c3aed',
  NAP: '#0891b2',
  OLT_SITE: '#2563eb',
  TOWER: '#d97706',
};

const DEFAULT_CENTER: [number, number] = [1.2136, -77.2811];

/** Subconjunto minimo de la API global de Leaflet cargada via CDN en index.html. */
interface LeafletMap {
  setView(center: [number, number], zoom: number): this;
  fitBounds(bounds: [number, number][], options?: { padding?: [number, number]; maxZoom?: number }): this;
  invalidateSize(): void;
  on(event: string, handler: (e: { latlng: { lat: number; lng: number } }) => void): this;
  remove(): void;
}
interface LeafletLayerGroup {
  clearLayers(): this;
  addTo(map: LeafletMap): this;
}
interface LeafletMarker {
  bindPopup(html: string): this;
  addTo(target: LeafletLayerGroup | LeafletMap): this;
}
interface LeafletStatic {
  map(el: HTMLElement, opts?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, opts?: Record<string, unknown>): { addTo(map: LeafletMap): unknown };
  layerGroup(): LeafletLayerGroup;
  divIcon(opts: Record<string, unknown>): unknown;
  marker(latlng: [number, number], opts?: Record<string, unknown>): LeafletMarker;
}

type TypeFilter = NodeType | 'ALL';
type StatusFilter = NodeStatus | 'ALL';

/**
 * Cobertura: mapa interactivo con Leaflet + OpenStreetMap y gestion completa
 * (crear, editar, eliminar, buscar y paginar) de nodos, cajas NAP, sitios OLT y torres.
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
    TablePagerComponent,
    RippleDirective,
  ],
  templateUrl: './coverage.component.html',
})
export class CoverageComponent {
  private readonly api = inject(NetworkApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  private readonly mapHost = viewChild<ElementRef<HTMLDivElement>>('mapHost');
  private map: LeafletMap | null = null;
  private markersLayer: LeafletLayerGroup | null = null;

  protected readonly nodes = collection(() => this.api.nodes(), [] as NetworkNode[]);
  protected readonly leafletReady = signal(typeof this.leaflet() !== 'undefined');
  protected readonly pickedCoords = signal<{ lat: number; lon: number } | null>(null);

  protected readonly search = signal('');
  protected readonly typeFilter = signal<TypeFilter>('ALL');
  protected readonly statusFilter = signal<StatusFilter>('ALL');

  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<NetworkNode | null>(null);
  protected readonly deleting = signal<NetworkNode | null>(null);
  protected readonly saving = signal(false);

  protected readonly nodeTypes: { value: NodeType; text: string }[] = [
    { value: 'POP', text: 'POP / nodo de distribucion' },
    { value: 'NAP', text: 'Caja NAP' },
    { value: 'OLT_SITE', text: 'Sitio de OLT' },
    { value: 'TOWER', text: 'Torre / antena' },
  ];

  protected readonly statusOptions: { value: StatusFilter; text: string }[] = [
    { value: 'ALL', text: 'Todos' },
    { value: 'ACTIVE', text: 'Activos' },
    { value: 'INACTIVE', text: 'Inactivos' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    type: ['NAP' as NodeType, Validators.required],
    latitude: [DEFAULT_CENTER[0], [Validators.required, Validators.min(-90), Validators.max(90)]],
    longitude: [DEFAULT_CENTER[1], [Validators.required, Validators.min(-180), Validators.max(180)]],
    status: ['ACTIVE' as NodeStatus, Validators.required],
  });

  protected readonly byType = computed(() => {
    const all = this.nodes.value();
    return this.nodeTypes.map((t) => ({
      ...t,
      icon: NODE_ICONS[t.value],
      color: NODE_COLORS[t.value],
      label: nodeTypeLabel(t.value),
      count: all.filter((n) => n.type === t.value).length,
      active: all.filter((n) => n.type === t.value && n.status === 'ACTIVE').length,
    }));
  });

  protected readonly filtered = computed(() => {
    const term = normalize(this.search());
    const type = this.typeFilter();
    const status = this.statusFilter();
    return this.nodes.value().filter((node) => {
      if (type !== 'ALL' && node.type !== type) {
        return false;
      }
      if (status !== 'ALL' && node.status !== status) {
        return false;
      }
      if (!term) {
        return true;
      }
      return [node.name, nodeTypeLabel(node.type).text, `${node.latitude}`, `${node.longitude}`]
        .map((v) => normalize(v))
        .some((v) => v.includes(term));
    });
  });

  protected readonly pager = paginate(this.filtered, 10);

  /** Fallback relativo si el CDN de Leaflet no esta disponible (modo sin conexion). */
  protected readonly plotted = computed(() => {
    const all = this.filtered();
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
      top: 8 + ((maxLat - node.latitude) / spanLat) * 84,
      left: 8 + ((node.longitude - minLon) / spanLon) * 84,
    }));
  });

  constructor() {
    effect(() => {
      const host = this.mapHost()?.nativeElement;
      const list = this.filtered();
      if (!host) {
        return;
      }
      this.ensureMap(host);
      this.renderMarkers(list);
    });

    this.destroyRef.onDestroy(() => {
      this.map?.remove();
      this.map = null;
      this.markersLayer = null;
    });
  }

  protected focusNode(node: NetworkNode): void {
    if (this.map) {
      this.map.setView([node.latitude, node.longitude], 16);
    }
  }

  protected recenterMap(): void {
    if (!this.map) {
      return;
    }
    const list = this.filtered();
    if (list.length === 0) {
      this.map.setView(DEFAULT_CENTER, 13);
      return;
    }
    if (list.length === 1) {
      this.map.setView([list[0].latitude, list[0].longitude], 15);
      return;
    }
    this.map.fitBounds(
      list.map((n) => [n.latitude, n.longitude] as [number, number]),
      { padding: [40, 40], maxZoom: 16 },
    );
  }

  protected openCreate(lat?: number, lon?: number): void {
    const picked = this.pickedCoords();
    this.editing.set(null);
    this.form.reset({
      name: '',
      type: 'NAP',
      latitude: lat ?? picked?.lat ?? DEFAULT_CENTER[0],
      longitude: lon ?? picked?.lon ?? DEFAULT_CENTER[1],
      status: 'ACTIVE',
    });
    this.modalOpen.set(true);
  }

  protected openEdit(node: NetworkNode): void {
    this.editing.set(node);
    this.form.reset({
      name: node.name,
      type: node.type,
      latitude: node.latitude,
      longitude: node.longitude,
      status: node.status,
    });
    this.modalOpen.set(true);
  }

  protected confirmDelete(node: NetworkNode): void {
    this.deleting.set(node);
  }

  protected close(): void {
    this.modalOpen.set(false);
    this.editing.set(null);
    this.deleting.set(null);
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
      ? this.api.updateNode(current.id, {
          name: raw.name.trim(),
          type: raw.type,
          latitude: Number(raw.latitude),
          longitude: Number(raw.longitude),
          status: raw.status,
        })
      : this.api.createNode({
          name: raw.name.trim(),
          type: raw.type,
          latitude: Number(raw.latitude),
          longitude: Number(raw.longitude),
        });

    request$.subscribe({
      next: (node) => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.editing.set(null);
        this.pickedCoords.set(null);
        this.toast.success(
          current ? `Nodo "${node.name}" actualizado.` : `Nodo "${node.name}" registrado.`,
        );
        this.nodes.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected removeNode(): void {
    const node = this.deleting();
    if (!node || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.deleteNode(node.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleting.set(null);
        this.toast.success(`Nodo "${node.name}" eliminado.`);
        this.nodes.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  private leaflet(): LeafletStatic | undefined {
    return (window as unknown as { L?: LeafletStatic }).L;
  }

  private ensureMap(host: HTMLDivElement): void {
    const L = this.leaflet();
    if (!L) {
      this.leafletReady.set(false);
      return;
    }
    this.leafletReady.set(true);
    if (this.map) {
      return;
    }
    const map = L.map(host, { zoomControl: true, scrollWheelZoom: true }).setView(
      DEFAULT_CENTER,
      13,
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    this.markersLayer = L.layerGroup().addTo(map);
    map.on('click', (e) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lon = Number(e.latlng.lng.toFixed(6));
      this.pickedCoords.set({ lat, lon });
    });
    this.map = map;
    setTimeout(() => this.map?.invalidateSize(), 150);
  }

  private renderMarkers(list: NetworkNode[]): void {
    const L = this.leaflet();
    if (!L || !this.map || !this.markersLayer) {
      return;
    }
    this.markersLayer.clearLayers();

    for (const node of list) {
      const color = node.status === 'ACTIVE' ? NODE_COLORS[node.type] : '#94a3b8';
      const iconHtml = `
        <div style="
          width:32px;height:32px;border-radius:50%;
          background:${color};color:#fff;
          display:grid;place-items:center;
          border:2.5px solid #fff;
          box-shadow:0 6px 16px rgba(15,23,42,.35);
          font-size:13px;">
          <i class="${NODE_ICONS[node.type]}"></i>
        </div>`;
      const icon = L.divIcon({
        html: iconHtml,
        className: 'coverage-leaflet-pin',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      });
      const safeName = escapeHtml(node.name);
      const typeText = escapeHtml(nodeTypeLabel(node.type).text);
      const statusText = escapeHtml(nodeStatusLabel(node.status).text);
      L.marker([node.latitude, node.longitude], { icon })
        .bindPopup(
          `<div style="min-width:155px;font-family:inherit">
            <strong style="font-size:13px">${safeName}</strong><br/>
            <span style="font-size:11px;color:#475569">${typeText} · ${statusText}</span><br/>
            <code style="font-size:11px;color:#64748b">${node.latitude}, ${node.longitude}</code>
          </div>`,
        )
        .addTo(this.markersLayer);
    }

    if (list.length === 1) {
      this.map.setView([list[0].latitude, list[0].longitude], 15);
    } else if (list.length > 1) {
      this.map.fitBounds(
        list.map((n) => [n.latitude, n.longitude] as [number, number]),
        { padding: [40, 40], maxZoom: 16 },
      );
    }
  }

  protected readonly typeLabel = nodeTypeLabel;
  protected readonly statusLabel = nodeStatusLabel;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
