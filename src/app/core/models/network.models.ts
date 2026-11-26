/** Espejo de los DTOs de dd_ms_network (routers, GPON, cobertura, inventario). */

export type RouterStatus = 'ONLINE' | 'OFFLINE' | 'ERROR';
export type OnuStatus = 'ONLINE' | 'LOS' | 'UNAUTHORIZED';
export type OnuVendor = 'HUAWEI' | 'ZTE' | 'OTHER';
export type NodeType = 'POP' | 'NAP' | 'OLT_SITE' | 'TOWER';
export type NodeStatus = 'ACTIVE' | 'INACTIVE';
export type EquipmentType = 'ROUTER' | 'ONT' | 'SWITCH' | 'ANTENNA' | 'OTHER';
export type EquipmentStatus = 'IN_STOCK' | 'ASSIGNED' | 'FAULTY' | 'RETIRED';

export interface MikrotikRouter {
  id: string;
  name: string;
  host: string;
  apiPort: number;
  apiUser: string;
  model: string | null;
  status: RouterStatus;
  createdAt: string;
}

export interface CreateRouterRequest {
  name: string;
  host: string;
  apiPort: number;
  apiUser: string;
  /** Se cifra en el backend con NETWORK_CRYPTO_SECRET; nunca vuelve en las respuestas. */
  apiPassword: string;
  model?: string | null;
}

/**
 * Ids que el backend concatena a comandos de RouterOS: id interno (*1A) o nombre sin
 * espacios, comillas ni "=". Misma regla que RouterOsIds en dd_ms_network.
 */
export const ROUTEROS_ID_PATTERN = /^([*][0-9A-Fa-f]{1,8}|[A-Za-z0-9][A-Za-z0-9._@-]{0,63})$/;

/** El secretId es el identificador del PPPoE secret / address-list en RouterOS. */
export interface CutClientRequest {
  secretId: string;
}

export interface QueueLimitRequest {
  queueId: string;
  uploadKbps: number;
  downloadKbps: number;
}

export interface Onu {
  id: string;
  serial: string;
  vendor: OnuVendor;
  oltName: string;
  ponPort: string;
  rxPower: number | null;
  status: OnuStatus;
  clientId: string | null;
  createdAt: string;
}

export interface RegisterOnuRequest {
  serial: string;
  vendor: OnuVendor;
  oltName: string;
  ponPort: string;
}

export interface AuthorizeOnuRequest {
  clientId: string;
}

export interface SignalUpdateRequest {
  rxPower: number;
}

export interface NetworkNode {
  id: string;
  name: string;
  type: NodeType;
  latitude: number;
  longitude: number;
  status: NodeStatus;
  createdAt: string;
}

export interface CreateNodeRequest {
  name: string;
  type: NodeType;
  latitude: number;
  longitude: number;
}

export interface UpdateNodeRequest {
  name: string;
  type: NodeType;
  latitude: number;
  longitude: number;
  status?: NodeStatus;
}

export interface Equipment {
  id: string;
  type: EquipmentType;
  brand: string | null;
  model: string | null;
  serialNumber: string;
  status: EquipmentStatus;
  assignedClientId: string | null;
  createdAt: string;
}

export interface CreateEquipmentRequest {
  type: EquipmentType;
  brand?: string | null;
  model?: string | null;
  serialNumber: string;
}

export interface UpdateEquipmentRequest {
  type: EquipmentType;
  brand?: string | null;
  model?: string | null;
  serialNumber: string;
  status?: EquipmentStatus;
  assignedClientId?: string | null;
}

export interface AssignEquipmentRequest {
  clientId: string;
}
