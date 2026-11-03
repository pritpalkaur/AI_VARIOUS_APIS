import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_GATEWAY_URL } from './api.config';
import { ApiSuccess, Page, Product, ProductInput } from './models';

export interface ProductQuery {
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  search?: string;
}

const BASE = `${API_GATEWAY_URL}/api/products`;

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);

  list(query: ProductQuery): Observable<Page<Product>> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('pageSize', query.pageSize)
      .set('sortBy', query.sortBy)
      .set('sortDir', query.sortDir);
    if (query.search) params = params.set('search', query.search);
    return this.http.get<ApiSuccess<Page<Product>>>(BASE, { params }).pipe(map(({ data }) => data));
  }

  get(id: number | string): Observable<Product> {
    return this.http.get<ApiSuccess<Product>>(`${BASE}/${id}`).pipe(map(({ data }) => data));
  }

  create(input: ProductInput): Observable<Product> {
    return this.http.post<ApiSuccess<Product>>(BASE, input).pipe(map(({ data }) => data));
  }

  update(id: number | string, input: ProductInput): Observable<Product> {
    return this.http.put<ApiSuccess<Product>>(`${BASE}/${id}`, input).pipe(map(({ data }) => data));
  }

  remove(id: number): Observable<{ id: number }> {
    return this.http.delete<ApiSuccess<{ id: number }>>(`${BASE}/${id}`).pipe(map(({ data }) => data));
  }
}
