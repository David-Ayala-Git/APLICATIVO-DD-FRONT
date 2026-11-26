/** Espejo de los DTOs de dd_ms_billing. */

export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type PaymentMethod = 'WOMPI' | 'PSE' | 'NEQUI' | 'MANUAL';
export type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';
/** Estado ante la DIAN; NOT_ISSUED mientras no haya proveedor tecnologico configurado. */
export type ElectronicInvoiceStatus = 'NOT_ISSUED' | 'ISSUED' | 'REJECTED';

export interface Invoice {
  id: string;
  clientId: string;
  planId: string | null;
  /** Formato YYYY-MM. */
  period: string;
  amount: number;
  status: InvoiceStatus;
  dueDate: string;
  issuedAt: string;
  /** Codigo unico de facturacion electronica (DIAN); null mientras no se timbra. */
  cufe: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  einvoiceStatus: ElectronicInvoiceStatus;
  /** Motivo del rechazo del proveedor/DIAN cuando einvoiceStatus es REJECTED. */
  einvoiceError: string | null;
}

export interface CreateInvoiceRequest {
  clientId: string;
  planId?: string | null;
  period: string;
  amount: number;
  /** ISO yyyy-MM-dd. */
  dueDate: string;
}

export interface UpdateInvoiceRequest {
  planId?: string | null;
  amount: number;
  dueDate: string;
  status?: InvoiceStatus;
}

export interface BillingRunResult {
  period: string;
  clientsEvaluated: number;
  invoicesCreated: number;
  invoicesSkipped: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  externalReference: string | null;
  paidAt: string | null;
}

/** Pago recibido a mano (efectivo o Nequi); solo MANUAL o NEQUI, por el total de la factura. */
export interface ManualPaymentRequest {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  /** Recibo o comprobante: el backend no registra dos veces la misma referencia. */
  externalReference: string;
}

export interface UpdatePaymentRequest {
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  externalReference: string;
}
