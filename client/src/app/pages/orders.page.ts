import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { takeFlash } from '../core/format';
import { ORDER_STATUSES, Order, Page, SortState } from '../core/models';
import { OrderQuery, OrderService } from '../core/order.service';
import { Alert } from '../shared/alert';
import { Pagination } from '../shared/pagination';
import { SortHeader } from '../shared/sort-header';

@Component({
  selector: 'app-orders-page',
  imports: [RouterLink, DatePipe, DecimalPipe, Alert, Pagination, SortHeader],
  template: `
    <section>
      <div class="page-header">
        <h1>{{ auth.isAdmin() ? 'All orders' : 'My orders' }}</h1>
        <a routerLink="/orders/new" class="btn btn-primary">+ New order</a>
      </div>

      <app-alert type="success" [message]="flash()" [closable]="true" (closed)="flash.set(null)" />
      <app-alert type="error" [message]="error()" [closable]="true" (closed)="error.set(null)" />

      <div class="toolbar">
        <label class="inline">
          Status
          <select (change)="setStatus($any($event.target).value)">
            <option value="" [selected]="!query().status">All</option>
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="query().status === s">{{ s }}</option>
            }
          </select>
        </label>
      </div>

      <div class="table-wrap">
        <table [class.loading]="loading()">
          <thead>
            <tr>
              <th appSortHeader field="id" label="#" [sort]="sort()" (sortChange)="onSort($event)"></th>
              <th>Product</th>
              @if (auth.isAdmin()) { <th>Customer</th> }
              <th appSortHeader class="num" field="quantity" label="Qty" [sort]="sort()" (sortChange)="onSort($event)"></th>
              <th class="num">Unit price</th>
              <th appSortHeader class="num" field="totalPrice" label="Total" [sort]="sort()" (sortChange)="onSort($event)"></th>
              <th appSortHeader field="status" label="Status" [sort]="sort()" (sortChange)="onSort($event)"></th>
              <th appSortHeader field="orderDate" label="Order date" [sort]="sort()" (sortChange)="onSort($event)"></th>
              <th class="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (o of result()?.items ?? []; track o.id) {
              <tr>
                <td class="muted">{{ o.id }}</td>
                <td>{{ o.productName }}</td>
                @if (auth.isAdmin()) { <td>{{ o.username }}</td> }
                <td class="num">{{ o.quantity }}</td>
                <td class="num">{{ o.unitPrice | number: '1.2-2' }}</td>
                <td class="num">{{ o.totalPrice | number: '1.2-2' }}</td>
                <td><span class="status status-{{ o.status.toLowerCase() }}">{{ o.status }}</span></td>
                <td class="nowrap">{{ o.orderDate | date: 'medium' }}</td>
                <td class="actions">
                  <a [routerLink]="['/orders', o.id, 'edit']" class="btn btn-small">Edit</a>
                  <button type="button" class="btn btn-small btn-danger" (click)="remove(o)">Delete</button>
                </td>
              </tr>
            } @empty {
              @if (result()) {
                <tr>
                  <td [attr.colspan]="auth.isAdmin() ? 9 : 8" class="empty">
                    {{ query().status ? 'No ' + query().status!.toLowerCase() + ' orders.' : 'No orders yet.' }}
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <app-pagination
        [pagination]="result()?.pagination ?? null"
        (pageChange)="setPage($event)"
        (pageSizeChange)="setPageSize($event)"
      />
    </section>
  `,
})
export class OrdersPage {
  private readonly orders = inject(OrderService);
  protected readonly auth = inject(AuthService);
  protected readonly statuses = ORDER_STATUSES;

  protected readonly query = signal<OrderQuery>({ page: 1, pageSize: 20, sortBy: 'orderDate', sortDir: 'desc', status: '' });
  protected readonly sort = computed<SortState>(() => ({ sortBy: this.query().sortBy, sortDir: this.query().sortDir }));
  protected readonly result = signal<Page<Order> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly flash = signal(takeFlash());
  private readonly reload = signal(0);

  constructor() {
    // Re-fetch whenever the query or the reload counter changes; switchMap drops stale responses.
    toObservable(computed(() => ({ query: this.query(), reload: this.reload() })))
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap(({ query }) =>
          this.orders.list(query).pipe(
            catchError((err: unknown) => {
              this.error.set(errorMessage(err));
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        if (page) {
          this.result.set(page);
          this.error.set(null);
        }
        this.loading.set(false);
      });
  }

  protected onSort(sort: SortState): void {
    this.query.update((q) => ({ ...q, ...sort, page: 1 }));
  }

  protected setStatus(status: string): void {
    this.query.update((q) => ({ ...q, status, page: 1 }));
  }

  protected setPage(page: number): void {
    this.query.update((q) => ({ ...q, page }));
  }

  protected setPageSize(pageSize: number): void {
    this.query.update((q) => ({ ...q, pageSize, page: 1 }));
  }

  protected remove(order: Order): void {
    if (!window.confirm(`Delete order #${order.id} (${order.productName})? This cannot be undone.`)) return;
    this.orders.remove(order.id).subscribe({
      next: () => {
        this.flash.set(`Order #${order.id} deleted.`);
        this.error.set(null);
        const lastOnPage = this.result()?.items.length === 1 && this.query().page > 1;
        if (lastOnPage) this.query.update((q) => ({ ...q, page: q.page - 1 }));
        else this.reload.update((n) => n + 1);
      },
      error: (err: unknown) => this.error.set(errorMessage(err)),
    });
  }
}
