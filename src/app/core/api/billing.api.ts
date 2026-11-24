import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  BillingRunResult,
  CreateInvoiceRequest,
  Invoice,
  ManualPaymentRequest,
  Payment,
} from '../models';
import { API } from './api.config';

/** dd_ms_billing: facturas, corrida mensual y pagos. */
@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);

  invoices(): Observable<Invoice[]> {
    return this.http.get<Invoice[]>(API.billing.invoices);
  }

  invoice(id: string): Observable<Invoice> {
    return this.http.get<Invoice>(`${API.billing.invoices}/${id}`);
  }

  createInvoice(body: CreateInvoiceRequest): Observable<Invoice> {
    return this.http.post<Invoice>(API.billing.invoices, body);
  }

  /** Facturacion masiva del periodo: recorre los clientes activos y emite lo que falte. */
  runBilling(): Observable<BillingRunResult> {
    return this.http.post<BillingRunResult>(API.billing.run, {});
  }

  payments(): Observable<Payment[]> {
    return this.http.get<Payment[]>(API.billing.payments);
  }

  /**
   * Registra un pago recibido en efectivo o por Nequi manual. Endpoint propio y
   * autenticado (Admin del ISP o Cartera): el webhook es solo para la pasarela y
   * exige su firma. El monto debe ser el total de la factura (no hay pagos
   * parciales) y la factura queda PAGADA.
   */
  registerPayment(body: ManualPaymentRequest): Observable<Payment> {
    return this.http.post<Payment>(`${API.billing.payments}/manual`, body);
  }
}
