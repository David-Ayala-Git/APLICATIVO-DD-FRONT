import { environment } from '../../../environments/environment';

/**
 * Rutas tal como las expone el api-gateway (dd_ms_gateway/application.yml).
 * El front nunca llama a un microservicio por su puerto: todo entra por /api/**.
 */
const base = environment.apiBaseUrl;

export const API = {
  auth: {
    login: `${base}/api/auth/login`,
    tenants: `${base}/api/auth/tenants`,
    users: `${base}/api/auth/users`,
  },
  crm: {
    clients: `${base}/api/crm/clients`,
    plans: `${base}/api/plans`,
    contracts: `${base}/api/contracts`,
  },
  billing: {
    invoices: `${base}/api/billing/invoices`,
    run: `${base}/api/billing/run`,
    payments: `${base}/api/payments`,
  },
  network: {
    routers: `${base}/api/network/routers`,
    onu: `${base}/api/gpon/onu`,
    nodes: `${base}/api/coverage/nodes`,
    links: `${base}/api/coverage/links`,
    equipment: `${base}/api/inventory/equipment`,
  },
  support: {
    tickets: `${base}/api/tickets`,
    technicians: `${base}/api/technicians`,
    workOrders: `${base}/api/technicians/orders`,
  },
  comms: {
    whatsapp: `${base}/api/whatsapp`,
    agents: `${base}/api/ai/agents`,
  },
  reports: {
    executive: `${base}/api/reports/executive`,
  },
} as const;
