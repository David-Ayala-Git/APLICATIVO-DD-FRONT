import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AiAgent,
  ChatRequest,
  ChatResponse,
  CreateAiAgentRequest,
  SendWhatsappRequest,
  WhatsappMessage,
} from '../models';
import { API } from './api.config';

/** dd_ms_comms: WhatsApp Cloud API y agentes de IA. */
@Injectable({ providedIn: 'root' })
export class CommsApi {
  private readonly http = inject(HttpClient);

  messages(): Observable<WhatsappMessage[]> {
    return this.http.get<WhatsappMessage[]>(API.comms.whatsapp);
  }

  /**
   * El backend envia por plantilla aprobada en Meta: la Cloud API rechaza texto
   * libre fuera de la ventana de 24 horas desde el ultimo mensaje del cliente.
   */
  send(body: SendWhatsappRequest): Observable<WhatsappMessage> {
    return this.http.post<WhatsappMessage>(`${API.comms.whatsapp}/send`, body);
  }

  agents(): Observable<AiAgent[]> {
    return this.http.get<AiAgent[]>(API.comms.agents);
  }

  createAgent(body: CreateAiAgentRequest): Observable<AiAgent> {
    return this.http.post<AiAgent>(API.comms.agents, body);
  }

  chat(agentId: string, body: ChatRequest): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${API.comms.agents}/${agentId}/chat`, body);
  }
}
