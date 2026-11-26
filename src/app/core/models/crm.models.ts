/** Espejo de los DTOs de dd_ms_crm. */

export type ClientStatus = 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
export type ContractStatus = 'DRAFT' | 'SIGNED' | 'CANCELLED';
export type Technology = 'FIBRA' | 'CABLE' | 'ANTENA';

export interface Client {
  id: string;
  /** Codigo unico del cliente (formato 0001, 0002, ...). */
  clientCode: string;
  fullName: string;
  document: string;
  phone: string | null;
  address: string | null;
  planId: string | null;
  status: ClientStatus;
  ipAddress: string | null;
  onuSerial: string | null;
  /** Router MikroTik donde esta su secret PPPoE (lo usa el corte por mora de n8n). */
  routerId: string | null;
  pppoeUser: string | null;
  createdAt: string;
}

export interface CreateClientRequest {
  /** Vacio o null = el backend genera el siguiente consecutivo (0001, 0002, ...). */
  clientCode?: string | null;
  fullName: string;
  document: string;
  phone?: string | null;
  address?: string | null;
  planId?: string | null;
}

export interface UpdateClientRequest {
  clientCode?: string | null;
  fullName: string;
  phone?: string | null;
  address?: string | null;
  planId?: string | null;
  status: ClientStatus;
  ipAddress?: string | null;
  onuSerial?: string | null;
  routerId?: string | null;
  pppoeUser?: string | null;
}

export interface Plan {
  id: string;
  name: string;
  downMbps: number;
  upMbps: number;
  technology: Technology;
  price: number;
  enabled?: boolean;
  createdAt: string;
}

export interface CreatePlanRequest {
  name: string;
  downMbps: number;
  upMbps: number;
  technology: Technology;
  price: number;
}

export interface UpdatePlanRequest {
  name: string;
  downMbps: number;
  upMbps: number;
  technology: Technology;
  price: number;
  enabled?: boolean;
}

export interface Contract {
  id: string;
  clientId: string;
  planId: string;
  status: ContractStatus;
  signedAt: string | null;
  documentUrl: string | null;
  createdAt: string;
}

export interface CreateContractRequest {
  clientId: string;
  planId: string;
  documentUrl?: string | null;
}
