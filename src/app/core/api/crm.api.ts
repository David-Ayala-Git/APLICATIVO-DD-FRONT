import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  Client,
  Contract,
  CreateClientRequest,
  CreateContractRequest,
  CreatePlanRequest,
  Plan,
  UpdateClientRequest,
  UpdatePlanRequest,
} from '../models';
import { API } from './api.config';

/** dd_ms_crm: clientes, planes y contratos. */
@Injectable({ providedIn: 'root' })
export class CrmApi {
  private readonly http = inject(HttpClient);

  clients(): Observable<Client[]> {
    return this.http.get<Client[]>(API.crm.clients);
  }

  nextClientCode(): Observable<{ nextCode: string }> {
    return this.http.get<{ nextCode: string }>(`${API.crm.clients}/next-code`);
  }

  client(id: string): Observable<Client> {
    return this.http.get<Client>(`${API.crm.clients}/${id}`);
  }

  createClient(body: CreateClientRequest): Observable<Client> {
    return this.http.post<Client>(API.crm.clients, body);
  }

  updateClient(id: string, body: UpdateClientRequest): Observable<Client> {
    return this.http.put<Client>(`${API.crm.clients}/${id}`, body);
  }

  plans(): Observable<Plan[]> {
    return this.http.get<Plan[]>(API.crm.plans);
  }

  createPlan(body: CreatePlanRequest): Observable<Plan> {
    return this.http.post<Plan>(API.crm.plans, body);
  }

  updatePlan(id: string, body: UpdatePlanRequest): Observable<Plan> {
    return this.http.put<Plan>(`${API.crm.plans}/${id}`, body);
  }

  updatePlanStatus(id: string, enabled: boolean): Observable<Plan> {
    return this.http.patch<Plan>(`${API.crm.plans}/${id}/status`, { enabled });
  }

  deletePlan(id: string): Observable<void> {
    return this.http.delete<void>(`${API.crm.plans}/${id}`);
  }

  contracts(): Observable<Contract[]> {
    return this.http.get<Contract[]>(API.crm.contracts);
  }

  createContract(body: CreateContractRequest): Observable<Contract> {
    return this.http.post<Contract>(API.crm.contracts, body);
  }

  signContract(id: string): Observable<Contract> {
    return this.http.post<Contract>(`${API.crm.contracts}/${id}/sign`, {});
  }
}
