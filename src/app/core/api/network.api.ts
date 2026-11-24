import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AssignEquipmentRequest,
  AuthorizeOnuRequest,
  CreateEquipmentRequest,
  CreateNodeRequest,
  CreateRouterRequest,
  CutClientRequest,
  Equipment,
  MikrotikRouter,
  NetworkNode,
  Onu,
  QueueLimitRequest,
  RegisterOnuRequest,
  SignalUpdateRequest,
} from '../models';
import { API } from './api.config';

/** dd_ms_network: MikroTik, GPON, cobertura e inventario. Exige el modulo "network". */
@Injectable({ providedIn: 'root' })
export class NetworkApi {
  private readonly http = inject(HttpClient);

  // ---------- MikroTik / RouterOS ----------

  routers(): Observable<MikrotikRouter[]> {
    return this.http.get<MikrotikRouter[]>(API.network.routers);
  }

  createRouter(body: CreateRouterRequest): Observable<MikrotikRouter> {
    return this.http.post<MikrotikRouter>(API.network.routers, body);
  }

  /** Corte por mora: mueve el secret al perfil de morosos. Responde 204 sin cuerpo. */
  cutClient(routerId: string, body: CutClientRequest): Observable<void> {
    return this.http.post<void>(`${API.network.routers}/${routerId}/cut`, body);
  }

  enableClient(routerId: string, body: CutClientRequest): Observable<void> {
    return this.http.post<void>(`${API.network.routers}/${routerId}/enable`, body);
  }

  setQueueLimit(routerId: string, body: QueueLimitRequest): Observable<void> {
    return this.http.post<void>(`${API.network.routers}/${routerId}/queue`, body);
  }

  // ---------- GPON ----------

  onus(): Observable<Onu[]> {
    return this.http.get<Onu[]>(API.network.onu);
  }

  registerOnu(body: RegisterOnuRequest): Observable<Onu> {
    return this.http.post<Onu>(API.network.onu, body);
  }

  authorizeOnu(id: string, body: AuthorizeOnuRequest): Observable<Onu> {
    return this.http.post<Onu>(`${API.network.onu}/authorize/${id}`, body);
  }

  /** Persiste la potencia optica leida de la OLT. */
  updateSignal(id: string, body: SignalUpdateRequest): Observable<Onu> {
    return this.http.post<Onu>(`${API.network.onu}/${id}/signal`, body);
  }

  // ---------- Cobertura ----------

  nodes(): Observable<NetworkNode[]> {
    return this.http.get<NetworkNode[]>(API.network.nodes);
  }

  createNode(body: CreateNodeRequest): Observable<NetworkNode> {
    return this.http.post<NetworkNode>(API.network.nodes, body);
  }

  // ---------- Inventario ----------

  equipment(): Observable<Equipment[]> {
    return this.http.get<Equipment[]>(API.network.equipment);
  }

  createEquipment(body: CreateEquipmentRequest): Observable<Equipment> {
    return this.http.post<Equipment>(API.network.equipment, body);
  }

  assignEquipment(id: string, body: AssignEquipmentRequest): Observable<Equipment> {
    return this.http.post<Equipment>(`${API.network.equipment}/${id}/assign`, body);
  }
}
