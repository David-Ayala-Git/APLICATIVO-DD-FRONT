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
  FiberLink,
  FiberPoint,
  FiberType,
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

const FIBER_META: Record<FiberType, { text: string; badge: string; color: string; weight: number; dashArray?: string }> = {
  TRUNK: { text: 'Troncal / Backbone', badge: 'badge-violet', color: '#7c3aed', weight: 5 },
  DISTRIBUTION: { text: 'Distribucion', badge: 'badge-info', color: '#06b6d4', weight: 4 },
  DROP: { text: 'Derivacion / Acometida', badge: 'badge-success', color: '#10b981', weight: 3, dashArray: '8 6' },
};

/** Providencia, Narino, Colombia (1.2390 N, -77.5974 W). */
const DEFAULT_CENTER: [number, number] = [1.239, -77.5974];
const DEFAULT_ZOOM = 15;

/** Subconjunto minimo de la API global de Leaflet cargada via CDN en index.html. */
interface LeafletTileLayer {
  addTo(map: LeafletMap): this;
  remove(): void;
}
interface LeafletMap {
  setView(center: [number, number], zoom: number): this;
  fitBounds(bounds: [number, number][], options?: { padding?: [number, number]; maxZoom?: number }): this;
  closePopup?(): this;
  invalidateSize(): void;
  on(event: string, handler: (e: { latlng: { lat: number; lng: number } }) => void): this;
  remove(): void;
}
interface LeafletLayerGroup {
  clearLayers(): this;
  addTo(map: LeafletMap): this;
}
interface LeafletLatLng {
  lat: number;
  lng: number;
}
interface LeafletInteractiveLayer {
  bindPopup(html: string): this;
  addTo(target: LeafletLayerGroup | LeafletMap): this;
  on(event: string, handler: (e: { latlng?: LeafletLatLng; target: LeafletDraggableMarker }) => void): this;
}
interface LeafletDraggableMarker extends LeafletInteractiveLayer {
  getLatLng(): LeafletLatLng;
}
interface LeafletPolyline extends LeafletInteractiveLayer {
  setLatLngs(latlngs: [number, number][]): this;
}
interface LeafletStatic {
  map(el: HTMLElement, opts?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, opts?: Record<string, unknown>): LeafletTileLayer;
  layerGroup(): LeafletLayerGroup;
  divIcon(opts: Record<string, unknown>): unknown;
  marker(latlng: [number, number], opts?: Record<string, unknown>): LeafletDraggableMarker;
  polyline(latlngs: [number, number][], opts?: Record<string, unknown>): LeafletPolyline;
  circleMarker(latlng: [number, number], opts?: Record<string, unknown>): LeafletInteractiveLayer;
  DomEvent?: { stopPropagation(e: unknown): void; preventDefault(e: unknown): void };
}

type MapStyleId = 'satellite' | 'relief' | 'topo' | 'streets' | 'dark';

interface MapTileSpec {
  url: string;
  maxZoom: number;
  maxNativeZoom?: number;
  attribution: string;
  opacity?: number;
}

interface MapStyleOption {
  id: MapStyleId;
  label: string;
  icon: string;
  layers: MapTileSpec[];
}

const MAP_STYLES: MapStyleOption[] = [
  {
    id: 'satellite',
    label: 'Satelite',
    icon: 'fas fa-satellite',
    layers: [
      {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 20,
        maxNativeZoom: 18,
        attribution: 'Tiles &copy; Esri &mdash; World Imagery',
      },
      {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 20,
        maxNativeZoom: 18,
        attribution: '&copy; Esri',
        opacity: 0.95,
      },
    ],
  },
  {
    id: 'relief',
    label: 'Relieve 3D',
    icon: 'fas fa-mountain-sun',
    layers: [
      {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 19,
        maxNativeZoom: 13,
        attribution: 'Tiles &copy; Esri &mdash; World Shaded Relief',
      },
      {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 19,
        attribution: '&copy; Esri',
        opacity: 0.92,
      },
    ],
  },
  {
    id: 'topo',
    label: 'Topografico',
    icon: 'fas fa-mountain',
    layers: [
      {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        maxZoom: 19,
        maxNativeZoom: 17,
        attribution: '&copy; OpenStreetMap, SRTM | &copy; OpenTopoMap (CC-BY-SA)',
      },
    ],
  },
  {
    id: 'streets',
    label: 'Calles',
    icon: 'fas fa-road',
    layers: [
      {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      },
    ],
  },
  {
    id: 'dark',
    label: 'Oscuro',
    icon: 'fas fa-moon',
    layers: [
      {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      },
    ],
  },
];

type TypeFilter = NodeType | 'ALL';
type StatusFilter = NodeStatus | 'ALL';
type NapFilter = NapOccupancyStatus | 'ALL';
type FiberTypeFilter = FiberType | 'ALL';

export interface NapPortSlot {
  portNumber: number;
  assignment: NapPortAssignment | null;
}

/**
 * Cobertura: mapa interactivo Leaflet en relieve centrado por defecto en
 * Providencia, Narino (Colombia), gestion de nodos, control de cajas NAP
 * (1x8 / 1x16) y trazado de conexiones de fibra optica entre nodos.
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
  private fiberLayer: LeafletLayerGroup | null = null;
  private draftFiberLayer: LeafletLayerGroup | null = null;
  private activeTileLayers: LeafletTileLayer[] = [];
  private skipNextAutoFit = false;

  protected readonly mapStyles = MAP_STYLES;
  protected readonly mapStyle = signal<MapStyleId>('satellite');
  protected readonly mapCollapsed = signal(false);

  protected readonly nodes = collection(() => this.api.nodes(), [] as NetworkNode[]);
  protected readonly fiberLinks = collection(
    () => this.api.fiberLinks().pipe(catchError(() => of([] as FiberLink[]))),
    [] as FiberLink[],
  );
  protected readonly clients = collection(
    () => this.crm.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );

  protected readonly leafletReady = signal(typeof this.leaflet() !== 'undefined');
  protected readonly pickedCoords = signal<{ lat: number; lon: number } | null>(null);

  // Filtros de nodos
  protected readonly search = signal('');
  protected readonly typeFilter = signal<TypeFilter>('ALL');
  protected readonly statusFilter = signal<StatusFilter>('ALL');
  protected readonly napFilter = signal<NapFilter>('ALL');

  // Filtros de trazados de fibra
  protected readonly linkSearch = signal('');
  protected readonly linkTypeFilter = signal<FiberTypeFilter>('ALL');

  // Modales de nodos / NAP
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

  // Modales y modo de trazado de fibra optica
  protected readonly linkModalOpen = signal(false);
  protected readonly editingLink = signal<FiberLink | null>(null);
  protected readonly deletingLink = signal<FiberLink | null>(null);
  protected readonly tracingFiber = signal(false);
  protected readonly draftWaypoints = signal<FiberPoint[]>([]);
  protected readonly draftFromNodeId = signal('');
  protected readonly draftToNodeId = signal('');
  protected readonly draftFiberColor = signal('#06b6d4');

  // Modo de reubicacion manual de nodo (arrastrar con mouse/dedo o tocar nueva posicion)
  protected readonly relocatingNodeId = signal<string | null>(null);
  protected readonly relocateCoords = signal<{ lat: number; lon: number } | null>(null);

  protected readonly nodeTypes: { value: NodeType; text: string }[] = [
    { value: 'POP', text: 'POP / nodo de distribucion' },
    { value: 'NAP', text: 'Caja NAP' },
    { value: 'OLT_SITE', text: 'Sitio de OLT' },
    { value: 'TOWER', text: 'Torre / antena' },
  ];

  protected readonly fiberTypes: { value: FiberType; text: string; color: string }[] = [
    { value: 'TRUNK', text: 'Troncal / Backbone', color: '#7c3aed' },
    { value: 'DISTRIBUTION', text: 'Distribucion', color: '#06b6d4' },
    { value: 'DROP', text: 'Derivacion / Acometida', color: '#10b981' },
  ];

  protected readonly fiberColorPresets = ['#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

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

  protected readonly linkForm = this.fb.nonNullable.group({
    name: [''],
    fromNodeId: ['', Validators.required],
    toNodeId: ['', Validators.required],
    fiberType: ['DISTRIBUTION' as FiberType, Validators.required],
    color: ['#06b6d4', Validators.required],
  });

  protected readonly nodesById = computed(
    () => new Map(this.nodes.value().map((n) => [n.id, n])),
  );

  /** Nodo actualmente en modo de reubicacion manual sobre el mapa. */
  protected readonly relocatingNode = computed<NetworkNode | null>(() => {
    const id = this.relocatingNodeId();
    return id ? (this.nodesById().get(id) ?? null) : null;
  });

  protected readonly hasRelocateChanged = computed(() => {
    const node = this.relocatingNode();
    const coords = this.relocateCoords();
    if (!node || !coords) {
      return false;
    }
    return (
      Math.abs(node.latitude - coords.lat) > 0.0000005 ||
      Math.abs(node.longitude - coords.lon) > 0.0000005
    );
  });

  /** Caja NAP actualmente abierta en el modal de control de puertos. */
  protected readonly managingNap = computed<NetworkNode | null>(() => {
    const id = this.managingNapId();
    if (!id) {
      return null;
    }
    return this.nodes.value().find((n) => n.id === id) ?? null;
  });

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

  protected readonly filteredLinks = computed(() => {
    const term = normalize(this.linkSearch());
    const type = this.linkTypeFilter();
    const map = this.nodesById();
    return this.fiberLinks.value().filter((link) => {
      if (type !== 'ALL' && link.fiberType !== type) {
        return false;
      }
      if (!term) {
        return true;
      }
      const fromName = map.get(link.fromNodeId)?.name ?? '';
      const toName = map.get(link.toNodeId)?.name ?? '';
      return [link.name, fromName, toName, FIBER_META[link.fiberType].text]
        .map((v) => normalize(v))
        .some((v) => v.includes(term));
    });
  });

  protected readonly linksPager = paginate(this.filteredLinks, 10);

  protected readonly totalFiberMeters = computed(() =>
    this.fiberLinks.value().reduce((sum, link) => sum + this.linkDistanceMeters(link), 0),
  );

  protected readonly draftDistanceMeters = computed(() => {
    const coords = this.draftPolylineCoords();
    return polylineDistanceMeters(coords);
  });

  /** Fallback relativo si el CDN de Leaflet no esta disponible. */
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
      const links = this.fiberLinks.value();
      const mapById = this.nodesById();
      const activeEditLinkId = this.tracingFiber() ? this.editingLink()?.id ?? null : null;
      const relocId = this.relocatingNodeId();
      const relocCoords = this.relocateCoords();
      if (!host) {
        return;
      }
      this.ensureMap(host);
      const override = relocId && relocCoords ? { nodeId: relocId, ...relocCoords } : null;
      this.renderFiberLinks(links, mapById, activeEditLinkId, override);
      this.renderMarkers(list, override);
    });

    effect(() => {
      const tracing = this.tracingFiber();
      const waypoints = this.draftWaypoints();
      const fromId = this.draftFromNodeId();
      const toId = this.draftToNodeId();
      const color = this.draftFiberColor();
      this.renderDraftFiber(tracing, fromId, toId, waypoints, color);
    });

    this.destroyRef.onDestroy(() => {
      this.map?.remove();
      this.map = null;
      this.markersLayer = null;
      this.fiberLayer = null;
      this.draftFiberLayer = null;
      this.activeTileLayers = [];
    });
  }

  protected nodeName(nodeId: string): string {
    return this.nodesById().get(nodeId)?.name ?? 'Nodo eliminado';
  }

  protected fiberMeta(type: FiberType): { text: string; badge: string; color: string } {
    return FIBER_META[type];
  }

  protected linkCoords(link: FiberLink): [number, number][] {
    const from = this.nodesById().get(link.fromNodeId);
    const to = this.nodesById().get(link.toNodeId);
    if (!from || !to) {
      return [];
    }
    return [
      [from.latitude, from.longitude],
      ...(link.waypoints ?? []).map((p) => [p.lat, p.lon] as [number, number]),
      [to.latitude, to.longitude],
    ];
  }

  protected linkDistanceMeters(link: FiberLink): number {
    return polylineDistanceMeters(this.linkCoords(link));
  }

  protected formatDistance(meters: number): string {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${Math.round(meters)} m`;
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

  protected toggleMapCollapsed(): void {
    const next = !this.mapCollapsed();
    this.mapCollapsed.set(next);
    if (!next) {
      this.refreshMapSize();
    }
  }

  private ensureMapExpanded(): boolean {
    if (!this.mapCollapsed()) {
      return false;
    }
    this.mapCollapsed.set(false);
    this.refreshMapSize();
    return true;
  }

  private refreshMapSize(): void {
    requestAnimationFrame(() => {
      this.map?.invalidateSize();
      setTimeout(() => this.map?.invalidateSize(), 180);
    });
  }

  protected focusNode(node: NetworkNode): void {
    const wasCollapsed = this.ensureMapExpanded();
    const run = () => {
      if (this.map) {
        this.map.invalidateSize();
        this.map.setView([node.latitude, node.longitude], 17);
      }
      this.mapHost()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    if (wasCollapsed) {
      setTimeout(run, 60);
    } else {
      run();
    }
  }

  protected focusLink(link: FiberLink): void {
    const coords = this.linkCoords(link);
    if (!this.map || coords.length === 0) {
      return;
    }
    const wasCollapsed = this.ensureMapExpanded();
    const run = () => {
      this.map?.invalidateSize();
      this.map?.fitBounds(coords, { padding: [50, 50], maxZoom: 17 });
      this.mapHost()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    if (wasCollapsed) {
      setTimeout(run, 60);
    } else {
      run();
    }
  }

  protected recenterMap(): void {
    this.ensureMapExpanded();
    if (!this.map) {
      return;
    }
    const list = this.filtered();
    if (list.length === 0) {
      this.map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    if (list.length === 1) {
      this.map.setView([list[0].latitude, list[0].longitude], 16);
      return;
    }
    this.map.fitBounds(
      list.map((n) => [n.latitude, n.longitude] as [number, number]),
      { padding: [40, 40], maxZoom: 17 },
    );
  }

  // ---------- Nodos y NAP ----------

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

  // ---------- Reubicacion manual de nodos en el mapa ----------

  protected startRelocateNode(node: NetworkNode): void {
    const wasCollapsed = this.ensureMapExpanded();
    // Cancela trazado de fibra si estaba activo para evitar conflictos de clics en el mapa
    this.tracingFiber.set(false);
    this.editingLink.set(null);
    this.draftWaypoints.set([]);
    this.pickedCoords.set(null);

    this.relocatingNodeId.set(node.id);
    this.relocateCoords.set({ lat: node.latitude, lon: node.longitude });

    const focus = () => {
      if (this.map) {
        this.map.invalidateSize();
        this.map.setView([node.latitude, node.longitude], 17);
      }
      this.mapHost()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    if (wasCollapsed) {
      setTimeout(focus, 60);
    } else {
      focus();
    }
  }

  protected resetRelocateNode(): void {
    const node = this.relocatingNode();
    if (!node) {
      return;
    }
    this.relocateCoords.set({ lat: node.latitude, lon: node.longitude });
  }

  protected cancelRelocateNode(): void {
    this.relocatingNodeId.set(null);
    this.relocateCoords.set(null);
  }

  protected saveRelocateNode(): void {
    const node = this.relocatingNode();
    const coords = this.relocateCoords();
    if (!node || !coords || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api
      .updateNode(node.id, {
        name: node.name,
        type: node.type,
        latitude: coords.lat,
        longitude: coords.lon,
        status: node.status,
        napCapacity: node.type === 'NAP' ? ((node.napCapacity ?? 8) as NapCapacity) : null,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.skipNextAutoFit = true;
          this.nodes.update((list) => list.map((n) => (n.id === updated.id ? updated : n)));
          this.relocatingNodeId.set(null);
          this.relocateCoords.set(null);
          this.toast.success(`Ubicacion de "${updated.name}" actualizada en el mapa.`);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  // ---------- Trazados de fibra optica ----------

  protected openCreateLink(keepDraft = false): void {
    const all = this.nodes.value();
    if (all.length < 2) {
      this.toast.error('Registra al menos 2 nodos para trazar una conexion de fibra optica.');
      return;
    }
    this.editingLink.set(null);
    if (!keepDraft) {
      const fromId = all[0].id;
      const toId = all[1].id;
      this.draftFromNodeId.set(fromId);
      this.draftToNodeId.set(toId);
      this.draftFiberColor.set(FIBER_META.DISTRIBUTION.color);
      this.draftWaypoints.set([]);
      this.linkForm.reset({
        name: '',
        fromNodeId: fromId,
        toNodeId: toId,
        fiberType: 'DISTRIBUTION',
        color: FIBER_META.DISTRIBUTION.color,
      });
    }
    this.tracingFiber.set(false);
    this.linkModalOpen.set(true);
  }

  protected openEditLink(link: FiberLink): void {
    this.editingLink.set(link);
    this.draftFromNodeId.set(link.fromNodeId);
    this.draftToNodeId.set(link.toNodeId);
    this.draftFiberColor.set(link.color);
    this.draftWaypoints.set([...(link.waypoints ?? [])]);
    this.linkForm.reset({
      name: link.name ?? '',
      fromNodeId: link.fromNodeId,
      toNodeId: link.toNodeId,
      fiberType: link.fiberType,
      color: link.color,
    });
    this.tracingFiber.set(false);
    this.linkModalOpen.set(true);
  }

  /**
   * Entra directamente al modo interactivo de ajuste de trayectoria sobre el mapa
   * para un trazado de fibra ya existente (arrastrar vertices, agregar curvas en '+' y guardar).
   */
  protected startAdjustExistingLink(link: FiberLink): void {
    const wasCollapsed = this.ensureMapExpanded();
    this.cancelRelocateNode();
    this.editingLink.set(link);
    this.draftFromNodeId.set(link.fromNodeId);
    this.draftToNodeId.set(link.toNodeId);
    this.draftFiberColor.set(link.color);
    this.draftWaypoints.set([...(link.waypoints ?? [])]);
    this.linkForm.reset({
      name: link.name ?? '',
      fromNodeId: link.fromNodeId,
      toNodeId: link.toNodeId,
      fiberType: link.fiberType,
      color: link.color,
    });
    this.linkModalOpen.set(false);
    this.tracingFiber.set(true);

    const coords = this.linkCoords(link);
    const focus = () => {
      if (this.map && coords.length >= 2) {
        this.map.invalidateSize();
        this.map.fitBounds(coords, { padding: [55, 55], maxZoom: 18 });
      }
      this.mapHost()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    if (wasCollapsed) {
      setTimeout(focus, 60);
    } else {
      focus();
    }
  }

  protected startTraceOnMap(): void {
    const wasCollapsed = this.ensureMapExpanded();
    this.cancelRelocateNode();
    const raw = this.linkForm.getRawValue();
    if (!raw.fromNodeId || !raw.toNodeId || raw.fromNodeId === raw.toNodeId) {
      this.toast.error('Selecciona un nodo de origen y un nodo de destino diferentes antes de trazar.');
      return;
    }
    this.draftFromNodeId.set(raw.fromNodeId);
    this.draftToNodeId.set(raw.toNodeId);
    this.draftFiberColor.set(raw.color);
    this.linkModalOpen.set(false);
    this.tracingFiber.set(true);

    const coords = this.draftPolylineCoords();
    const focus = () => {
      if (this.map && coords.length >= 2) {
        this.map.invalidateSize();
        this.map.fitBounds(coords, { padding: [55, 55], maxZoom: 18 });
      }
      this.mapHost()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    if (wasCollapsed) {
      setTimeout(focus, 60);
    } else {
      focus();
    }
  }

  protected undoDraftWaypoint(): void {
    this.draftWaypoints.update((pts) => pts.slice(0, -1));
  }

  protected clearDraftWaypoints(): void {
    this.draftWaypoints.set([]);
  }

  protected finishTraceAndSave(): void {
    if (this.editingLink()) {
      this.saveLink();
      return;
    }
    this.tracingFiber.set(false);
    this.linkModalOpen.set(true);
  }

  protected cancelTrace(): void {
    this.tracingFiber.set(false);
    this.editingLink.set(null);
    this.draftWaypoints.set([]);
  }

  protected onLinkFromChange(nodeId: string): void {
    this.draftFromNodeId.set(nodeId);
  }

  protected onLinkToChange(nodeId: string): void {
    this.draftToNodeId.set(nodeId);
  }

  protected onFiberTypeChange(type: FiberType): void {
    const color = FIBER_META[type].color;
    this.linkForm.controls.color.setValue(color);
    this.draftFiberColor.set(color);
  }

  protected setFiberColor(color: string): void {
    this.linkForm.controls.color.setValue(color);
    this.draftFiberColor.set(color);
  }

  protected saveLink(): void {
    if (this.linkForm.invalid || this.saving()) {
      this.linkForm.markAllAsTouched();
      return;
    }
    const raw = this.linkForm.getRawValue();
    if (raw.fromNodeId === raw.toNodeId) {
      this.toast.error('El nodo origen y el nodo destino deben ser diferentes.');
      return;
    }
    const current = this.editingLink();
    const payload = {
      name: raw.name.trim() || null,
      fromNodeId: raw.fromNodeId,
      toNodeId: raw.toNodeId,
      fiberType: raw.fiberType,
      color: raw.color,
      waypoints: this.draftWaypoints(),
    };

    this.saving.set(true);
    const request$ = current
      ? this.api.updateFiberLink(current.id, payload)
      : this.api.createFiberLink(payload);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.linkModalOpen.set(false);
        this.editingLink.set(null);
        this.tracingFiber.set(false);
        this.draftWaypoints.set([]);
        this.toast.success(
          current ? 'Trazado de fibra optica actualizado.' : 'Conexion de fibra optica guardada.',
        );
        this.fiberLinks.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected confirmDeleteLink(link: FiberLink): void {
    this.deletingLink.set(link);
  }

  protected removeLink(): void {
    const target = this.deletingLink();
    if (!target || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.deleteFiberLink(target.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.deletingLink.set(null);
        this.toast.success('Trazado de fibra eliminado.');
        this.fiberLinks.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected close(): void {
    this.modalOpen.set(false);
    this.editing.set(null);
    this.deleting.set(null);
    this.managingNapId.set(null);
    this.linkModalOpen.set(false);
    this.editingLink.set(null);
    this.deletingLink.set(null);
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
        this.fiberLinks.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(describeHttpError(err));
      },
    });
  }

  protected setMapStyle(styleId: MapStyleId): void {
    this.mapStyle.set(styleId);
    this.applyBaseLayers(styleId);
  }

  protected reloadAll(): void {
    this.nodes.reload();
    this.fiberLinks.reload();
  }

  private draftPolylineCoords(): [number, number][] {
    const from = this.nodesById().get(this.draftFromNodeId());
    const to = this.nodesById().get(this.draftToNodeId());
    if (!from || !to) {
      return [];
    }
    return [
      [from.latitude, from.longitude],
      ...this.draftWaypoints().map((p) => [p.lat, p.lon] as [number, number]),
      [to.latitude, to.longitude],
    ];
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
      DEFAULT_ZOOM,
    );
    this.map = map;
    this.applyBaseLayers(this.mapStyle());
    this.fiberLayer = L.layerGroup().addTo(map);
    this.draftFiberLayer = L.layerGroup().addTo(map);
    this.markersLayer = L.layerGroup().addTo(map);
    map.on('click', (e) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lon = Number(e.latlng.lng.toFixed(6));
      if (this.relocatingNodeId()) {
        this.relocateCoords.set({ lat, lon });
        return;
      }
      if (this.tracingFiber()) {
        this.draftWaypoints.update((pts) => [...pts, { lat, lon }]);
        return;
      }
      this.pickedCoords.set({ lat, lon });
    });

    const onHostClick = (ev: MouseEvent) => {
      const btn = (ev.target as HTMLElement | null)?.closest?.('[data-relocate-node]') as HTMLElement | null;
      if (!btn) {
        return;
      }
      const nodeId = btn.getAttribute('data-relocate-node');
      const target = nodeId ? this.nodesById().get(nodeId) : null;
      if (target) {
        ev.stopPropagation();
        this.map?.closePopup?.();
        this.startRelocateNode(target);
      }
    };
    host.addEventListener('click', onHostClick);
    this.destroyRef.onDestroy(() => host.removeEventListener('click', onHostClick));

    let rafId: number | null = null;
    const scheduleResize = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        this.map?.invalidateSize();
      });
    };

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => scheduleResize());
      ro.observe(host);
      this.destroyRef.onDestroy(() => ro.disconnect());
    }
    window.addEventListener('resize', scheduleResize);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', scheduleResize);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    });

    setTimeout(() => this.map?.invalidateSize(), 150);
  }

  private applyBaseLayers(styleId: MapStyleId): void {
    const L = this.leaflet();
    if (!L || !this.map) {
      return;
    }
    for (const layer of this.activeTileLayers) {
      layer.remove();
    }
    this.activeTileLayers = [];

    const spec = MAP_STYLES.find((s) => s.id === styleId) ?? MAP_STYLES[0];
    for (const tile of spec.layers) {
      const layer = L.tileLayer(tile.url, {
        maxZoom: tile.maxZoom,
        ...(tile.maxNativeZoom !== undefined ? { maxNativeZoom: tile.maxNativeZoom } : {}),
        attribution: tile.attribution,
        ...(tile.opacity !== undefined ? { opacity: tile.opacity } : {}),
      }).addTo(this.map);
      this.activeTileLayers.push(layer);
    }
  }

  private renderFiberLinks(
    links: FiberLink[],
    nodesMap: Map<string, NetworkNode>,
    excludeLinkId: string | null = null,
    relocateOverride: { nodeId: string; lat: number; lon: number } | null = null,
  ): void {
    const L = this.leaflet();
    if (!L || !this.map || !this.fiberLayer) {
      return;
    }
    this.fiberLayer.clearLayers();

    for (const link of links) {
      if (excludeLinkId && link.id === excludeLinkId) {
        continue;
      }
      const from = nodesMap.get(link.fromNodeId);
      const to = nodesMap.get(link.toNodeId);
      if (!from || !to) {
        continue;
      }
      const fromPos: [number, number] =
        relocateOverride && relocateOverride.nodeId === from.id
          ? [relocateOverride.lat, relocateOverride.lon]
          : [from.latitude, from.longitude];
      const toPos: [number, number] =
        relocateOverride && relocateOverride.nodeId === to.id
          ? [relocateOverride.lat, relocateOverride.lon]
          : [to.latitude, to.longitude];
      const coords: [number, number][] = [
        fromPos,
        ...(link.waypoints ?? []).map((p) => [p.lat, p.lon] as [number, number]),
        toPos,
      ];
      const meta = FIBER_META[link.fiberType] ?? FIBER_META.DISTRIBUTION;
      const color = link.color || meta.color;
      const distText = this.formatDistance(polylineDistanceMeters(coords));
      const title = escapeHtml(link.name || `${from.name} → ${to.name}`);

      // Contorno sutil para contraste sobre satelite o relieve
      L.polyline(coords, {
        color: '#ffffff',
        weight: meta.weight + 3,
        opacity: 0.65,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(this.fiberLayer);

      // Linea principal de fibra optica
      L.polyline(coords, {
        color,
        weight: meta.weight,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        ...(meta.dashArray ? { dashArray: meta.dashArray } : {}),
      })
        .bindPopup(
          `<div style="min-width:190px;font-family:inherit">
            <strong style="font-size:13px">${title}</strong><br/>
            <span style="font-size:11px;color:#475569">${escapeHtml(from.name)} &rarr; ${escapeHtml(to.name)}</span>
            <div style="margin-top:4px;font-size:11px;font-weight:700;color:${escapeHtml(color)}">
              ${escapeHtml(meta.text)} · ${escapeHtml(distText)}
            </div>
            <div style="margin-top:4px;font-size:10px;color:#64748b">
              Usa "Ajustar ruta" en la tabla para mover o curvar este trazado.
            </div>
          </div>`,
        )
        .addTo(this.fiberLayer);
    }
  }

  private renderDraftFiber(
    tracing: boolean,
    fromId: string,
    toId: string,
    waypoints: FiberPoint[],
    color: string,
  ): void {
    const L = this.leaflet();
    if (!L || !this.draftFiberLayer) {
      return;
    }
    this.draftFiberLayer.clearLayers();
    if (!tracing) {
      return;
    }
    const from = this.nodesById().get(fromId);
    const to = this.nodesById().get(toId);
    if (!from || !to) {
      return;
    }

    const buildCoords = (pts: FiberPoint[]): [number, number][] => [
      [from.latitude, from.longitude],
      ...pts.map((p) => [p.lat, p.lon] as [number, number]),
      [to.latitude, to.longitude],
    ];

    const coords = buildCoords(waypoints);

    // Contorno blanco + linea editable en vivo
    const casingLine = L.polyline(coords, {
      color: '#ffffff',
      weight: 7,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(this.draftFiberLayer);

    const previewLine = L.polyline(coords, {
      color,
      weight: 4,
      opacity: 1,
      dashArray: '10 6',
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(this.draftFiberLayer);

    // 1. Puntos '+' intermedios en la mitad de cada segmento: clic o arrastrar agrega una curva/poste
    for (let seg = 0; seg < coords.length - 1; seg++) {
      const [lat1, lon1] = coords[seg];
      const [lat2, lon2] = coords[seg + 1];
      const midLat = Number(((lat1 + lat2) / 2).toFixed(6));
      const midLon = Number(((lon1 + lon2) / 2).toFixed(6));
      const insertIndex = seg;

      const plusIcon = L.divIcon({
        html: `<div style="
          width:18px;height:18px;border-radius:50%;
          background:rgba(255,255,255,0.92);color:${escapeHtml(color)};
          border:2px solid ${escapeHtml(color)};
          display:grid;place-items:center;
          font-size:12px;font-weight:800;line-height:1;
          box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:grab;"
          title="Arrastra o haz clic para agregar un punto y curvar la fibra">+</div>`,
        className: 'fiber-midpoint-handle',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const midMarker = L.marker([midLat, midLon], { icon: plusIcon, draggable: true }).addTo(
        this.draftFiberLayer,
      );

      let dragged = false;
      midMarker.on('drag', (e) => {
        dragged = true;
        const pos = e.target.getLatLng();
        const nextPts = [...waypoints];
        nextPts.splice(insertIndex, 0, { lat: pos.lat, lon: pos.lng });
        const nextCoords = buildCoords(nextPts);
        casingLine.setLatLngs(nextCoords);
        previewLine.setLatLngs(nextCoords);
      });
      midMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        const pt = { lat: Number(pos.lat.toFixed(6)), lon: Number(pos.lng.toFixed(6)) };
        this.draftWaypoints.update((pts) => {
          const next = [...pts];
          next.splice(insertIndex, 0, pt);
          return next;
        });
      });
      midMarker.on('click', (e) => {
        L.DomEvent?.stopPropagation(e);
        if (dragged) {
          dragged = false;
          return;
        }
        this.draftWaypoints.update((pts) => {
          const next = [...pts];
          next.splice(insertIndex, 0, { lat: midLat, lon: midLon });
          return next;
        });
      });
    }

    // 2. Vertices existentes arrastrables (arrastrar para mover, clic derecho o doble clic para eliminar)
    waypoints.forEach((pt, idx) => {
      const vertexIcon = L.divIcon({
        html: `<div style="
          width:16px;height:16px;border-radius:50%;
          background:${escapeHtml(color)};
          border:3px solid #ffffff;
          box-shadow:0 2px 10px rgba(0,0,0,.45);cursor:move;"
          title="Arrastra para mover este punto · Clic derecho o doble clic para quitarlo"></div>`,
        className: 'fiber-vertex-handle',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const vertexMarker = L.marker([pt.lat, pt.lon], { icon: vertexIcon, draggable: true }).addTo(
        this.draftFiberLayer!,
      );

      vertexMarker.on('drag', (e) => {
        const pos = e.target.getLatLng();
        const nextPts = waypoints.map((w, i) => (i === idx ? { lat: pos.lat, lon: pos.lng } : w));
        const nextCoords = buildCoords(nextPts);
        casingLine.setLatLngs(nextCoords);
        previewLine.setLatLngs(nextCoords);
      });
      vertexMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        const updatedPt = { lat: Number(pos.lat.toFixed(6)), lon: Number(pos.lng.toFixed(6)) };
        this.draftWaypoints.update((pts) => pts.map((w, i) => (i === idx ? updatedPt : w)));
      });
      vertexMarker.on('contextmenu', (e) => {
        L.DomEvent?.stopPropagation(e);
        L.DomEvent?.preventDefault(e);
        this.draftWaypoints.update((pts) => pts.filter((_, i) => i !== idx));
      });
      vertexMarker.on('dblclick', (e) => {
        L.DomEvent?.stopPropagation(e);
        L.DomEvent?.preventDefault(e);
        this.draftWaypoints.update((pts) => pts.filter((_, i) => i !== idx));
      });
    });
  }

  private renderMarkers(
    list: NetworkNode[],
    relocateOverride: { nodeId: string; lat: number; lon: number } | null = null,
  ): void {
    const L = this.leaflet();
    if (!L || !this.map || !this.markersLayer) {
      return;
    }
    this.markersLayer.clearLayers();

    for (const node of list) {
      const isRelocating = relocateOverride !== null && relocateOverride.nodeId === node.id;
      const lat = isRelocating ? relocateOverride.lat : node.latitude;
      const lon = isRelocating ? relocateOverride.lon : node.longitude;
      const color =
        node.status !== 'ACTIVE'
          ? '#94a3b8'
          : node.type === 'NAP' && node.napStatus
            ? NAP_OCCUPANCY_COLORS[node.napStatus]
            : NODE_COLORS[node.type];

      const pinSize = isRelocating ? 40 : 32;
      const iconHtml = isRelocating
        ? `
          <div class="coverage-pin-relocating" style="--pin-color:${color}" title="Arrastra para mover este nodo o haz clic en el mapa">
            <span class="coverage-pin-pulse"></span>
            <div class="coverage-pin-core" style="background:${color}">
              <i class="${NODE_ICONS[node.type]}"></i>
            </div>
          </div>`
        : `
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
        className: isRelocating ? 'coverage-leaflet-pin is-relocating' : 'coverage-leaflet-pin',
        iconSize: [pinSize, pinSize],
        iconAnchor: [pinSize / 2, pinSize / 2],
        popupAnchor: [0, -pinSize / 2],
      });

      const marker = L.marker([lat, lon], {
        icon,
        draggable: isRelocating,
        ...(isRelocating ? { zIndexOffset: 1000 } : {}),
      }).addTo(this.markersLayer);

      if (isRelocating) {
        marker.on('drag', (e) => {
          const pos = e.target.getLatLng();
          this.renderFiberLinks(this.fiberLinks.value(), this.nodesById(), null, {
            nodeId: node.id,
            lat: pos.lat,
            lon: pos.lng,
          });
        });
        marker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          this.relocateCoords.set({
            lat: Number(pos.lat.toFixed(6)),
            lon: Number(pos.lng.toFixed(6)),
          });
        });
      } else {
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
        marker.bindPopup(
          `<div style="min-width:185px;font-family:inherit">
            <strong style="font-size:13px">${safeName}</strong><br/>
            <span style="font-size:11px;color:#475569">${typeText} · ${statusText}</span>
            ${napHtml}
            <div style="margin-top:3px"><code style="font-size:11px;color:#64748b">${node.latitude}, ${node.longitude}</code></div>
            <button type="button" data-relocate-node="${escapeHtml(node.id)}" class="coverage-popup-btn">
              <i class="fas fa-arrows-up-down-left-right"></i> Mover ubicacion
            </button>
          </div>`,
        );
      }
    }

    if (relocateOverride || this.skipNextAutoFit) {
      this.skipNextAutoFit = false;
      return;
    }

    if (list.length === 1) {
      this.map.setView([list[0].latitude, list[0].longitude], 16);
    } else if (list.length > 1) {
      this.map.fitBounds(
        list.map((n) => [n.latitude, n.longitude] as [number, number]),
        { padding: [40, 40], maxZoom: 17 },
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

/** Distancia total aproximada en metros usando formula de Haversine. */
function polylineDistanceMeters(coords: [number, number][]): number {
  if (coords.length < 2) {
    return 0;
  }
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lat1, lon1] = coords[i - 1];
    const [lat2, lon2] = coords[i];
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    total += 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}
