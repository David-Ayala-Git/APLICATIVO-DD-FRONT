/**
 * Traduccion de los enums del backend a etiqueta en espanol + clase de badge.
 * Centralizado para que "SUSPENDED" se lea igual en CRM, facturacion y red.
 */

export interface Label {
  text: string;
  badge: 'badge-success' | 'badge-danger' | 'badge-warning' | 'badge-info' | 'badge-violet' | 'badge-gray';
  /** true cuando queremos el punto parpadeante del mockup. */
  dot?: boolean;
}

const fallback: Label = { text: '—', badge: 'badge-gray' };

function lookup(map: Record<string, Label>, key: string | null | undefined): Label {
  if (!key) {
    return fallback;
  }
  return map[key] ?? { text: key, badge: 'badge-gray' };
}

// ---------- CRM ----------

const CLIENT_STATUS: Record<string, Label> = {
  ACTIVE: { text: 'Activo', badge: 'badge-success', dot: true },
  SUSPENDED: { text: 'Suspendido', badge: 'badge-danger', dot: true },
  RETIRED: { text: 'Retirado', badge: 'badge-gray' },
};
export const clientStatusLabel = (v?: string | null) => lookup(CLIENT_STATUS, v);

const TECHNOLOGY: Record<string, Label> = {
  FIBRA: { text: 'Fibra', badge: 'badge-violet' },
  CABLE: { text: 'Cable UTP', badge: 'badge-gray' },
  ANTENA: { text: 'Antena', badge: 'badge-warning' },
};
export const technologyLabel = (v?: string | null) => lookup(TECHNOLOGY, v);

const CONTRACT_STATUS: Record<string, Label> = {
  DRAFT: { text: 'Esperando firma', badge: 'badge-warning', dot: true },
  SIGNED: { text: 'Firmado', badge: 'badge-success', dot: true },
  CANCELLED: { text: 'Anulado', badge: 'badge-gray' },
};
export const contractStatusLabel = (v?: string | null) => lookup(CONTRACT_STATUS, v);

// ---------- Facturacion ----------

const INVOICE_STATUS: Record<string, Label> = {
  PENDING: { text: 'Pendiente', badge: 'badge-warning' },
  PAID: { text: 'Pagada', badge: 'badge-success' },
  OVERDUE: { text: 'Vencida', badge: 'badge-danger' },
  CANCELLED: { text: 'Anulada', badge: 'badge-gray' },
};
export const invoiceStatusLabel = (v?: string | null) => lookup(INVOICE_STATUS, v);

const PAYMENT_METHOD: Record<string, Label> = {
  WOMPI: { text: 'Wompi', badge: 'badge-info' },
  PSE: { text: 'PSE', badge: 'badge-info' },
  NEQUI: { text: 'Nequi', badge: 'badge-violet' },
  MANUAL: { text: 'Efectivo / manual', badge: 'badge-gray' },
};
export const paymentMethodLabel = (v?: string | null) => lookup(PAYMENT_METHOD, v);

const PAYMENT_STATUS: Record<string, Label> = {
  PENDING: { text: 'En proceso', badge: 'badge-warning' },
  CONFIRMED: { text: 'Confirmado', badge: 'badge-success' },
  FAILED: { text: 'Rechazado', badge: 'badge-danger' },
};
export const paymentStatusLabel = (v?: string | null) => lookup(PAYMENT_STATUS, v);

// ---------- Red ----------

const ROUTER_STATUS: Record<string, Label> = {
  ONLINE: { text: 'En linea', badge: 'badge-success', dot: true },
  OFFLINE: { text: 'Fuera de linea', badge: 'badge-danger', dot: true },
  ERROR: { text: 'Error de API', badge: 'badge-warning', dot: true },
};
export const routerStatusLabel = (v?: string | null) => lookup(ROUTER_STATUS, v);

const ONU_STATUS: Record<string, Label> = {
  ONLINE: { text: 'En linea', badge: 'badge-success', dot: true },
  LOS: { text: 'Senal perdida (LOS)', badge: 'badge-danger', dot: true },
  UNAUTHORIZED: { text: 'Sin autorizar', badge: 'badge-info', dot: true },
};
export const onuStatusLabel = (v?: string | null) => lookup(ONU_STATUS, v);

const ONU_VENDOR: Record<string, Label> = {
  HUAWEI: { text: 'Huawei', badge: 'badge-violet' },
  ZTE: { text: 'ZTE', badge: 'badge-info' },
  OTHER: { text: 'Otro', badge: 'badge-gray' },
};
export const onuVendorLabel = (v?: string | null) => lookup(ONU_VENDOR, v);

const NODE_TYPE: Record<string, Label> = {
  POP: { text: 'POP / nodo', badge: 'badge-violet' },
  NAP: { text: 'Caja NAP', badge: 'badge-info' },
  OLT_SITE: { text: 'Sitio OLT', badge: 'badge-violet' },
  TOWER: { text: 'Torre / antena', badge: 'badge-warning' },
};
export const nodeTypeLabel = (v?: string | null) => lookup(NODE_TYPE, v);

const NODE_STATUS: Record<string, Label> = {
  ACTIVE: { text: 'Activo', badge: 'badge-success', dot: true },
  INACTIVE: { text: 'Inactivo', badge: 'badge-gray' },
};
export const nodeStatusLabel = (v?: string | null) => lookup(NODE_STATUS, v);

const EQUIPMENT_TYPE: Record<string, Label> = {
  ROUTER: { text: 'Router', badge: 'badge-violet' },
  ONT: { text: 'ONU / ONT', badge: 'badge-info' },
  SWITCH: { text: 'Switch', badge: 'badge-violet' },
  ANTENNA: { text: 'Antena', badge: 'badge-warning' },
  OTHER: { text: 'Otro', badge: 'badge-gray' },
};
export const equipmentTypeLabel = (v?: string | null) => lookup(EQUIPMENT_TYPE, v);

const EQUIPMENT_STATUS: Record<string, Label> = {
  IN_STOCK: { text: 'En bodega', badge: 'badge-success' },
  ASSIGNED: { text: 'Asignado', badge: 'badge-info' },
  FAULTY: { text: 'Averiado', badge: 'badge-danger' },
  RETIRED: { text: 'Dado de baja', badge: 'badge-gray' },
};
export const equipmentStatusLabel = (v?: string | null) => lookup(EQUIPMENT_STATUS, v);

// ---------- Soporte ----------

const PRIORITY: Record<string, Label> = {
  LOW: { text: 'Baja', badge: 'badge-info' },
  MEDIUM: { text: 'Media', badge: 'badge-warning' },
  HIGH: { text: 'Alta', badge: 'badge-warning' },
  URGENT: { text: 'Urgente', badge: 'badge-danger' },
};
export const priorityLabel = (v?: string | null) => lookup(PRIORITY, v);

const TICKET_STATUS: Record<string, Label> = {
  OPEN: { text: 'Abierto', badge: 'badge-warning' },
  IN_PROGRESS: { text: 'En proceso', badge: 'badge-info' },
  RESOLVED: { text: 'Resuelto', badge: 'badge-success' },
  CLOSED: { text: 'Cerrado', badge: 'badge-gray' },
};
export const ticketStatusLabel = (v?: string | null) => lookup(TICKET_STATUS, v);

const TECHNICIAN_STATUS: Record<string, Label> = {
  AVAILABLE: { text: 'Disponible', badge: 'badge-success' },
  BUSY: { text: 'En ruta', badge: 'badge-warning' },
  OFF: { text: 'Descanso', badge: 'badge-gray' },
};
export const technicianStatusLabel = (v?: string | null) => lookup(TECHNICIAN_STATUS, v);

const WORK_ORDER_TYPE: Record<string, Label> = {
  INSTALLATION: { text: 'Instalacion', badge: 'badge-success' },
  REPAIR: { text: 'Soporte', badge: 'badge-danger' },
  MAINTENANCE: { text: 'Mantenimiento', badge: 'badge-violet' },
  DISCONNECTION: { text: 'Retiro', badge: 'badge-gray' },
};
export const workOrderTypeLabel = (v?: string | null) => lookup(WORK_ORDER_TYPE, v);

const WORK_ORDER_STATUS: Record<string, Label> = {
  SCHEDULED: { text: 'Agendada', badge: 'badge-info' },
  IN_PROGRESS: { text: 'En curso', badge: 'badge-warning' },
  COMPLETED: { text: 'Completada', badge: 'badge-success' },
  CANCELLED: { text: 'Cancelada', badge: 'badge-gray' },
};
export const workOrderStatusLabel = (v?: string | null) => lookup(WORK_ORDER_STATUS, v);

// ---------- Comunicaciones ----------

const MESSAGE_STATUS: Record<string, Label> = {
  PENDING: { text: 'En cola', badge: 'badge-warning' },
  SENT: { text: 'Enviado', badge: 'badge-info' },
  DELIVERED: { text: 'Entregado', badge: 'badge-success' },
  READ: { text: 'Leido', badge: 'badge-success' },
  FAILED: { text: 'Fallido', badge: 'badge-danger' },
  RECEIVED: { text: 'Recibido', badge: 'badge-info' },
};
export const messageStatusLabel = (v?: string | null) => lookup(MESSAGE_STATUS, v);

// ---------- Auth ----------

const ROLE: Record<string, Label> = {
  SUPER_ADMIN: { text: 'Super Admin', badge: 'badge-violet' },
  ADMIN_ISP: { text: 'Admin ISP', badge: 'badge-violet' },
  OPERADOR: { text: 'Operador', badge: 'badge-info' },
  TECNICO: { text: 'Tecnico', badge: 'badge-gray' },
  CARTERA: { text: 'Cartera', badge: 'badge-info' },
};
export const roleLabel = (v?: string | null) => lookup(ROLE, v);

const TENANT_PLAN: Record<string, Label> = {
  TRIAL: { text: 'Trial', badge: 'badge-warning' },
  PRO: { text: 'Plan Pro', badge: 'badge-violet' },
  ENTERPRISE: { text: 'Enterprise', badge: 'badge-info' },
};
export const tenantPlanLabel = (v?: string | null) => lookup(TENANT_PLAN, v);

const TENANT_STATUS: Record<string, Label> = {
  ACTIVE: { text: 'Activo', badge: 'badge-success', dot: true },
  SUSPENDED: { text: 'Suspendido', badge: 'badge-danger', dot: true },
};
export const tenantStatusLabel = (v?: string | null) => lookup(TENANT_STATUS, v);

/** Potencia optica: por debajo de -27 dBm el enlace se considera degradado. */
export function rxPowerLabel(rx: number | null | undefined): Label {
  if (rx === null || rx === undefined) {
    return fallback;
  }
  const text = `${rx.toFixed(1)} dBm`;
  if (rx < -27) {
    return { text, badge: 'badge-danger' };
  }
  if (rx < -25) {
    return { text, badge: 'badge-warning' };
  }
  return { text, badge: 'badge-success' };
}
