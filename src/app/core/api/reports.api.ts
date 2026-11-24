import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ExecutiveReport } from '../models';
import { API } from './api.config';

/** dd_ms_reports: tablero ejecutivo (MRR, ARPU, churn). */
@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);

  current(): Observable<ExecutiveReport> {
    return this.http.get<ExecutiveReport>(API.reports.executive);
  }

  /** Recalcula el periodo en curso cruzando CRM y facturacion. */
  refresh(): Observable<ExecutiveReport> {
    return this.http.post<ExecutiveReport>(`${API.reports.executive}/refresh`, {});
  }

  history(): Observable<ExecutiveReport[]> {
    return this.http.get<ExecutiveReport[]>(`${API.reports.executive}/history`);
  }
}
