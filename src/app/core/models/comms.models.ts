/** Espejo de los DTOs de dd_ms_comms (WhatsApp Cloud API + agentes de IA). */

export type MessageDirection = 'IN' | 'OUT';
export type MessageStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'RECEIVED';

export interface WhatsappMessage {
  id: string;
  phone: string;
  direction: MessageDirection;
  body: string | null;
  templateName: string | null;
  status: MessageStatus;
  sentAt: string | null;
  createdAt: string;
}

export interface SendWhatsappRequest {
  phone: string;
  /** Nombre de la plantilla aprobada en Meta Business. */
  templateName: string;
  bodyParams: string[];
}

export interface AiAgent {
  id: string;
  name: string;
  channel: string;
  systemPrompt: string;
  /** Lista de herramientas separada por comas, tal como la guarda el backend. */
  tools: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface CreateAiAgentRequest {
  name: string;
  channel: string;
  systemPrompt: string;
  tools?: string | null;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
}
