/** Estructura del menu lateral, igual al mockup. */

export type NavCounter = 'openTickets' | 'unreadWhatsapp' | 'unauthorizedOnus' | 'overdueInvoices';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Contador en vivo que se pinta como badge junto al nombre. */
  counter?: NavCounter;
  /** Badge fijo, cuando lo que importa es senalar la integracion. */
  tag?: { text: string; tone: 'cyan' | 'soft' };
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: 'Principal',
    items: [
      { path: 'dashboard', label: 'Dashboard', icon: 'fas fa-gauge-high' },
      { path: 'crm', label: 'CRM Clientes', icon: 'fas fa-users' },
      { path: 'plans', label: 'Planes', icon: 'fas fa-layer-group' },
    ],
  },
  {
    label: 'Red e Infraestructura',
    items: [
      {
        path: 'mikrotik',
        label: 'MikroTik',
        icon: 'fas fa-network-wired',
        tag: { text: 'API', tone: 'cyan' },
      },
      {
        path: 'gpon',
        label: 'GPON · OLT/ONU',
        icon: 'fas fa-satellite-dish',
        counter: 'unauthorizedOnus',
      },
      { path: 'coverage', label: 'Cobertura', icon: 'fas fa-map-marked-alt' },
      { path: 'inventory', label: 'Inventario', icon: 'fas fa-boxes-stacked' },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      {
        path: 'billing',
        label: 'Facturacion',
        icon: 'fas fa-file-invoice-dollar',
        counter: 'overdueInvoices',
      },
      { path: 'payments', label: 'Pagos', icon: 'fas fa-credit-card' },
      { path: 'contracts', label: 'Contratos', icon: 'fas fa-file-signature' },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { path: 'tickets', label: 'Mesa de ayuda', icon: 'fas fa-headset', counter: 'openTickets' },
      { path: 'technicians', label: 'Tecnicos', icon: 'fas fa-user-gear' },
      { path: 'activations', label: 'Activaciones', icon: 'fas fa-toggle-on' },
    ],
  },
  {
    label: 'Comunicacion e IA',
    items: [
      {
        path: 'whatsapp',
        label: 'WhatsApp',
        icon: 'fab fa-whatsapp',
        counter: 'unreadWhatsapp',
      },
      { path: 'ai', label: 'Agentes de IA', icon: 'fas fa-robot' },
      { path: 'automation', label: 'Automatizacion', icon: 'fas fa-diagram-project' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { path: 'reports', label: 'Reportes', icon: 'fas fa-chart-line' },
      { path: 'modules', label: 'Modulos', icon: 'fas fa-cubes' },
      { path: 'settings', label: 'Configuracion', icon: 'fas fa-sliders' },
    ],
  },
];
