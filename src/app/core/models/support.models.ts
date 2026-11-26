/** Espejo de los DTOs de dd_ms_support (tickets, tecnicos, ordenes de trabajo). */

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TechnicianStatus = 'AVAILABLE' | 'BUSY' | 'OFF';
export type WorkOrderType = 'INSTALLATION' | 'REPAIR' | 'MAINTENANCE' | 'DISCONNECTION';
export type WorkOrderStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Ticket {
  id: string;
  clientId: string;
  reason: string;
  priority: Priority;
  status: TicketStatus;
  assignedTo: string | null;
  slaDueAt: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface CreateTicketRequest {
  clientId: string;
  reason: string;
  priority: Priority;
}

export interface AssignTicketRequest {
  technicianId: string;
}

export interface Technician {
  id: string;
  fullName: string;
  phone: string | null;
  status: TechnicianStatus;
  createdAt: string;
}

export interface CreateTechnicianRequest {
  fullName: string;
  phone?: string | null;
}

export interface UpdateTechnicianStatusRequest {
  status: TechnicianStatus;
}

export interface WorkOrder {
  id: string;
  clientId: string;
  ticketId: string | null;
  type: WorkOrderType;
  technicianId: string | null;
  scheduledAt: string | null;
  address: string | null;
  status: WorkOrderStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface CreateWorkOrderRequest {
  clientId: string;
  ticketId?: string | null;
  type: WorkOrderType;
  technicianId?: string | null;
  /** ISO 8601 con offset (OffsetDateTime en el backend). */
  scheduledAt?: string | null;
  address?: string | null;
}

export interface UpdateWorkOrderRequest {
  clientId: string;
  ticketId?: string | null;
  type: WorkOrderType;
  technicianId?: string | null;
  scheduledAt?: string | null;
  address?: string | null;
  status?: WorkOrderStatus;
}
