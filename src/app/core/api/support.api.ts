import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AssignTicketRequest,
  CreateTechnicianRequest,
  CreateTicketRequest,
  CreateWorkOrderRequest,
  Technician,
  Ticket,
  UpdateTechnicianStatusRequest,
  WorkOrder,
} from '../models';
import { API } from './api.config';

/** dd_ms_support: mesa de ayuda, cuadrilla y ordenes de trabajo. Exige el modulo "support". */
@Injectable({ providedIn: 'root' })
export class SupportApi {
  private readonly http = inject(HttpClient);

  // ---------- Tickets ----------

  tickets(): Observable<Ticket[]> {
    return this.http.get<Ticket[]>(API.support.tickets);
  }

  createTicket(body: CreateTicketRequest): Observable<Ticket> {
    return this.http.post<Ticket>(API.support.tickets, body);
  }

  assignTicket(id: string, body: AssignTicketRequest): Observable<Ticket> {
    return this.http.post<Ticket>(`${API.support.tickets}/${id}/assign`, body);
  }

  resolveTicket(id: string): Observable<Ticket> {
    return this.http.post<Ticket>(`${API.support.tickets}/${id}/resolve`, {});
  }

  closeTicket(id: string): Observable<Ticket> {
    return this.http.post<Ticket>(`${API.support.tickets}/${id}/close`, {});
  }

  // ---------- Cuadrilla ----------

  technicians(): Observable<Technician[]> {
    return this.http.get<Technician[]>(API.support.technicians);
  }

  createTechnician(body: CreateTechnicianRequest): Observable<Technician> {
    return this.http.post<Technician>(API.support.technicians, body);
  }

  updateTechnicianStatus(id: string, body: UpdateTechnicianStatusRequest): Observable<Technician> {
    return this.http.post<Technician>(`${API.support.technicians}/${id}/status`, body);
  }

  // ---------- Ordenes de trabajo ----------

  workOrders(): Observable<WorkOrder[]> {
    return this.http.get<WorkOrder[]>(API.support.workOrders);
  }

  createWorkOrder(body: CreateWorkOrderRequest): Observable<WorkOrder> {
    return this.http.post<WorkOrder>(API.support.workOrders, body);
  }

  completeWorkOrder(id: string): Observable<WorkOrder> {
    return this.http.post<WorkOrder>(`${API.support.workOrders}/${id}/complete`, {});
  }
}
