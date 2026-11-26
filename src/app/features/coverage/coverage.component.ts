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
import { catchError, of } from 'rxjs';

import { CrmApi, NetworkApi } from '../../core/api';
import {
  Client,
  NapCapacity,
  NapOccupancyStatus,
  NapPortAssignment,
  NetworkNode,
  NodeStatus,
  NodeType,
} from '../../core/models';
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

const NAP_OCCUPANCY_COLORS: Record<NapOccupancyStatus, string> = {
  AVAILABLE: '#10b981',
  LOW: '#f59e0b',
  FULL: '#ef4444',
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
type NapFilter = NapOccupancyStatus | 'ALL';

export interface NapPortSlot {
  portNumber: number;
  assignment: NapPortAssignment | null;
}

/**
 * Cobertura: mapa interactivo Leaflet + OpenStreetMap, gestion de nodos,
 * capacidad de cajas NAP (1x8 / 1x16) y control de puertos asignados por cliente.
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
  private readonly crm = inject(CrmApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  private readonly mapHost = viewChild<ElementRef<HTMLDivElement>>('mapHost');
  private map: LeafletMap | null = null;
  private markersLayer: LeafletLayerGroup | null = null;

  protected readonly nodes = collection(() => this.api.nodes(), [] as NetworkNode[]);
  protected readonly clients = collection(
    () => this.crm.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );

  protected readonly leafletReady = signal(typeof this.leaflet() !== 'undefined');
  protected readonly pickedCoords = signal<{ lat: number; lon: number } | null>(null);

  protected readonly search = signal('');
  protected readonly typeFilter = signal<TypeFilter>('ALL');
  protected readonly statusFilter = signal<StatusFilter>('ALL');
  protected readonly napFilter = signal<NapFilter>('ALL');

  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<NetworkNode | null>(null);
  protected readonly deleting = signal<NetworkNode | null>(null);
  protected readonly managingNapId = signal<string | null>(null);
  protected readonly selectedNodeType = signal<NodeType>('NAP');
  protected readonly selectedNapCapacity = signal<NapCapacity>(8);
  protected readonly selectedPort = signal('');
  protected readonly clientSearch = signal('');
  protected readonly saving = signal(false);
  protected readonly busyAssignmentId = signal<string | null>(null);

  protected readonly nodeTypes: { value: NodeType; text: string }[] = [
    { value: 'POP', text: 'POP / nodo de distribucion' },
    { value: 'NAP', text: 'Caja NAP' },
    { value: 'OLT_SITE', text: 'Sitio de OLT' },
    { value: 'TOWER', text: 'Torre / antena' },
  ];

  protected readonly napCapacities: { value: NapCapacity; text: string }[] = [
    { value: 8, text: '1x8 (8 puertos)' },
    { value: 16, text: '1x16 (16 puertos)' },
  ];

  protected readonly statusOptions: { value: StatusFilter; text: string }[] = [
    { value: 'ALL', text: 'Todos' },
    { value: 'ACTIVE', text: 'Activos' },
    { value: 'INACTIVE', text: 'Inactivos' },
  ];

  protected readonly napFilterOptions: { value: NapFilter; text: string }[] = [
    { value: 'ALL', text: 'Cualquier ocupacion NAP' },
    { value: 'AVAILABLE', text: 'NAP con puertos disponibles' },
    { value: 'LOW', text: 'NAP con pocos puertos' },
    { value: 'FULL', text: 'NAP llena' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    type: ['NAP' as NodeType, Validators.required],
    napCapacity: [8 as NapCapacity],
    latitude: [DEFAULT_CENTER[0], [Validators.required, Validators.min(-90), Validators.max(90)]],
    longitude: [DEFAULT_CENTER[1], [Validators.required, Validators.min(-180), Validators.max(180)]],
    status: ['ACTIVE' as NodeStatus, Validators.required],
  });

  protected readonly assignForm = this.fb.nonNullable.group({
    clientId: ['', Validators.required],
    portNumber: [''],
  });

  /** Caja NAP actualmente abierta en el modal de control de puertos. */
  protected readonly managingNap = computed<NetworkNode | null>(() => {
    const id = this.managingNapId();
    if (!id) {
      return null;
    }
    return this.nodes.value().find((n) => n.id === id) ?? null;
  });

  /** Mapa clienteId -> nombre de caja NAP + puerto donde ya esta conectado. */
  protected readonly clientNapIndex = computed(() => {
    const map = new Map<string, { nodeName: string; portNumber: number }>();
    for (const node of this.nodes.value()) {
      for (const a of node.assignments ?? []) {
        map.set(a.clientId, { nodeName: node.name, portNumber: a.portNumber });
      }
    }
    return map;
  });

  protected readonly napPortSlots = computed<NapPortSlot[]>(() => {
    const nap = this.managingNap();
    if (!nap || nap.type !== 'NAP') {
      return [];
    }
    const capacity = nap.napCapacity ?? 8;
    const byPort = new Map((nap.assignments ?? []).map((a) => [a.portNumber, a]));
    return Array.from({ length: capacity }, (_, i) => ({
      portNumber: i + 1,
      assignment: byPort.get(i + 1) ?? null,
    }));
  });

  protected readonly freePortsForNap = computed(() =>
    this.napPortSlots()
      .filter((s) => !s.assignment)
      .map((s) => s.portNumber),
  );

  protected readonly filteredClients = computed(() => {
    const term = normalize(this.clientSearch());
    const list = this.clients.value();
    if (!term) {
      return list;
    }
    return list.filter((c) =>
      [c.clientCode, c.fullName, c.document, c.address]
        .map((v) => normalize(v))
        .some((v) => v.includes(term)),
    );
  });

  protected readonly napSummary = computed(() => {
    const naps = this.nodes.value().filter((n) => n.type === 'NAP');
    const totalPorts = naps.reduce((s, n) => s + (n.napCapacity ?? 8), 0);
    const usedPorts = naps.reduce((s, n) => s + (n.usedPorts ?? 0), 0);
    return {
      total: naps.length,
      available: naps.filter((n) => n.napStatus === 'AVAILABLE').length,
      low: naps.filter((n) => n.napStatus === 'LOW').length,
      full: naps.filter((n) => n.napStatus === 'FULL').length,
      totalPorts,
      usedPorts,
      freePorts: Math.max(0, totalPorts - usedPorts),
    };
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
    const nap = this.napFilter();
    return this.nodes.value().filter((node) => {
      if (type !== 'ALL' && node.type !== type) {
        return false;
      }
      if (status !== 'ALL' && node.status !== status) {
        return false;
      }
      if (nap !== 'ALL' && (node.type !== 'NAP' || node.napStatus !== nap)) {
        return false;
      }
      if (!term) {
        return true;
      }
      const capText = node.napCapacity ? `1x${node.napCapacity}` : '';
      return [node.name, nodeTypeLabel(node.type).text, capText, `${node.latitude}`, `${node.longitude}`]
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

  protected napOccupancyMeta(node: NetworkNode): { text: string; badge: string; color: string; pct: number } {
    const cap = node.napCapacity ?? 8;
    const used = node.usedPorts ?? 0;
    const free = node.availablePorts ?? Math.max(0, cap - used);
    const pct = Math.min(100, Math.round((used / cap) * 100));
    switch (node.napStatus) {
      case 'FULL':
        return { text: 'Llena (0 libres)', badge: 'badge-danger', color: '#ef4444', pct };
      case 'LOW':
        return { text: `Pocos puertos (${free} libre${free === 1 ? '' : 's'})`, badge: 'badge-warning', color: '#f59e0b', pct };
      default:
        return { text: `Disponible (${free} libres)`, badge: 'badge-success', color: '#10b981', pct };
    }
  }

  protected clientLabel(clientId: string): { name: string; sub: string } {
    const client = this.clients.value().find((c) => c.id === clientId);
    if (!client) {
      return { name: 'Cliente', sub: clientId.slice(0, 8) };
    }
    return {
      name: client.fullName,
      sub: `${client.clientCode ? '#' + client.clientCode + ' · ' : ''}${client.document}`,
    };
  }

  protected clientOptionText(client: Client): string {
    const prefix = client.clientCode ? `[${client.clientCode}] ` : '';
    const existing = this.clientNapIndex().get(client.id);
    const suffix = existing ? ` — ya en ${existing.nodeName} (P${existing.portNumber})` : '';
    return `${prefix}${client.fullName} · ${client.document}${suffix}`;
  }

  protected isClientAssignedElsewhere(clientId: string): boolean {
    return this.clientNapIndex().has(clientId);
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
    this.selectedNodeType.set('NAP');
    this.selectedNapCapacity.set(8);
    this.form.reset({
      name: '',
      type: 'NAP',
      napCapacity: 8,
      latitude: lat ?? picked?.lat ?? DEFAULT_CENTER[0],
      longitude: lon ?? picked?.lon ?? DEFAULT_CENTER[1],
      status: 'ACTIVE',
    });
    this.modalOpen.set(true);
  }

  protected openEdit(node: NetworkNode): void {
    const cap = (node.napCapacity ?? 8) as NapCapacity;
    this.editing.set(node);
    this.selectedNodeType.set(node.type);
    this.selectedNapCapacity.set(cap);
    this.form.reset({
      name: node.name,
      type: node.type,
      napCapacity: cap,
      latitude: node.latitude,
      longitude: node.longitude,
      status: node.status,
    });
    this.modalOpen.set(true);
  }

  protected onNodeTypeChange(type: NodeType): void {
    this.selectedNodeType.set(type);
    this.form.controls.type.setValue(type);
  }

  protected setNapCapacity(cap: NapCapacity): void {
    this.selectedNapCapacity.set(cap);
    this.form.controls.napCapacity.setValue(cap);
  }

  protected openNapPorts(node: NetworkNode): void {
    this.managingNapId.set(node.id);
    this.clientSearch.set('');
    this.selectedPort.set('');
    const firstFreeClient = this.clients.value().find((c) => !this.clientNapIndex().has(c.id));
    this.assignForm.reset({
      clientId: firstFreeClient?.id ?? this.clients.value()[0]?.id ?? '',
      portNumber: '',
    });
  }

  protected pickPort(portNumber: number): void {
    const val = String(portNumber);
    this.selectedPort.set(val);
    this.assignForm.controls.portNumber.setValue(val);
  }

  protected onPortSelectChange(value: string): void {
    this.selectedPort.set(value);
  }

  protected confirmDelete(node: NetworkNode): void {
    this.deleting.set(node);
  }

  protected close(): void {
    this.modalOpen.set(false);
    this.editing.set(null);
    this.deleting.set(null);
    this.managingNapId.set(null);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const napCapacity = raw.type === 'NAP' ? (Number(raw.napCapacity) as NapCapacity) : null;
    const current = this.editing();
    this.saving.set(true);

    const request$ = current
      ? this.api.updateNode(current.id, {
          name: raw.name.trim(),
          type: raw.type,
          latitude: Number(raw.latitude),
          longitude: Number(raw.longitude),
          status: raw.status,
          napCapacity,
        })
      : this.api.createNode({
          name: raw.name.trim(),
          type: raw.type,
          latitude: Number(raw.latitude),
          longitude: Number(raw.longitude),
          napCapacity,
        });

    request$.subscribe({
      next: (node) => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.editing.set(null);
        this.pickedCoords.set(null);
        const capInfo = node.type === 'NAP' && node.napCapacity ? ` (1x${node.napCapacity})` : '';
        this.toast.success(
          current
            ? `Nodo "${node.name}"${capInfo} actualizado.`
            : `Nodo "${node.name}"${capInfo} registrado.`,
        );
        this.nodes.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected assignClientToNap(): void {
    const nap = this.managingNap();
    if (!nap || this.assignForm.invalid || this.saving()) {
      this.assignForm.markAllAsTouched();
      return;
    }
    const raw = this.assignForm.getRawValue();
    this.saving.set(true);
    this.api
      .assignNapClient(nap.id, {
        clientId: raw.clientId,
        portNumber: raw.portNumber ? Number(raw.portNumber) : null,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.nodes.update((list) => list.map((n) => (n.id === updated.id ? updated : n)));
          const nextFreeClient = this.clients
            .value()
            .find((c) => c.id !== raw.clientId && !this.clientNapIndex().has(c.id));
          this.selectedPort.set('');
          this.assignForm.reset({
            clientId: nextFreeClient?.id ?? '',
            portNumber: '',
          });
          this.toast.success(
            `Cliente asignado a ${updated.name} (${updated.usedPorts}/${updated.napCapacity} puertos ocupados).`,
          );
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  protected unassignFromNap(assignment: NapPortAssignment): void {
    const nap = this.managingNap();
    if (!nap || this.busyAssignmentId()) {
      return;
    }
    this.busyAssignmentId.set(assignment.id);
    this.api.unassignNapClient(nap.id, assignment.id).subscribe({
      next: (updated) => {
        this.busyAssignmentId.set(null);
        this.nodes.update((list) => list.map((n) => (n.id === updated.id ? updated : n)));
        this.toast.success(`Puerto #${assignment.portNumber} liberado en ${updated.name}.`);
      },
      error: (err: unknown) => {
        this.busyAssignmentId.set(null);
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
      const color =
        node.status !== 'ACTIVE'
          ? '#94a3b8'
          : node.type === 'NAP' && node.napStatus
            ? NAP_OCCUPANCY_COLORS[node.napStatus]
            : NODE_COLORS[node.type];

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
      let napHtml = '';
      if (node.type === 'NAP') {
        const cap = node.napCapacity ?? 8;
        const used = node.usedPorts ?? 0;
        const occ = this.napOccupancyMeta(node);
        napHtml = `<div style="margin-top:4px;font-size:11px;font-weight:700;color:${occ.color}">
          Caja 1x${cap} · ${used}/${cap} puertos · ${escapeHtml(occ.text)}
        </div>`;
      }
      L.marker([node.latitude, node.longitude], { icon })
        .bindPopup(
          `<div style="min-width:175px;font-family:inherit">
            <strong style="font-size:13px">${safeName}</strong><br/>
            <span style="font-size:11px;color:#475569">${typeText} · ${statusText}</span>
            ${napHtml}
            <div style="margin-top:3px"><code style="font-size:11px;color:#64748b">${node.latitude}, ${node.longitude}</code></div>
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
