import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_GATEWAY_URL } from './api.config';
import { ApiSuccess, Order, OrderInput, Page } from './models';

export interface OrderQuery {
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  status?: string;
}

const BASE = `${API_GATEWAY_URL}/api/orders`;

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);

  /** A User gets only their own orders; an Admin gets everyone's (enforced by the service). */
  list(query: OrderQuery): Observable<Page<Order>> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('pageSize', query.pageSize)
      .set('sortBy', query.sortBy)
      .set('sortDir', query.sortDir);
    if (query.status) params = params.set('status', query.status);
    return this.http.get<ApiSuccess<Page<Order>>>(BASE, { params }).pipe(map(({ data }) => data));
  }

  get(id: number | string): Observable<Order> {
    return this.http.get<ApiSuccess<Order>>(`${BASE}/${id}`).pipe(map(({ data }) => data));
  }

  create(input: OrderInput): Observable<Order> {
    return this.http.post<ApiSuccess<Order>>(BASE, input).pipe(map(({ data }) => data));
  }

  update(id: number | string, input: OrderInput): Observable<Order> {
    return this.http.put<ApiSuccess<Order>>(`${BASE}/${id}`, input).pipe(map(({ data }) => data));
  }

  remove(id: number): Observable<{ id: number }> {
    return this.http.delete<ApiSuccess<{ id: number }>>(`${BASE}/${id}`).pipe(map(({ data }) => data));
  }
}
