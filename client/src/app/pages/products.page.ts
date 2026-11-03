import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { takeFlash } from '../core/format';
import { Page, Product, SortState } from '../core/models';
import { ProductQuery, ProductService } from '../core/product.service';
import { Alert } from '../shared/alert';
import { Pagination } from '../shared/pagination';
import { SortHeader } from '../shared/sort-header';

@Component({
  selector: 'app-products-page',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, DecimalPipe, Alert, Pagination, SortHeader],
  template: `
    <section>
      <div class="page-header">
        <h1>Products</h1>
        @if (auth.isAdmin()) {
          <a routerLink="/products/new" class="btn btn-primary">+ New product</a>
        }
      </div>

      <app-alert type="success" [message]="flash()" [closable]="true" (closed)="flash.set(null)" />
      <app-alert type="error" [message]="error()" [closable]="true" (closed)="error.set(null)" />

      <div class="toolbar">
        <input type="search" placeholder="Search by name…" maxlength="100" [formControl]="search"
               aria-label="Search products by name" />
      </div>

      <div class="table-wrap">
        <table [class.loading]="loading()">
          <thead>
            <tr>
              <th appSortHeader field="id" label="#" [sort]="sort()" (sortChange)="onSort($event)"></th>
              <th appSortHeader field="name" label="Name" [sort]="sort()" (sortChange)="onSort($event)"></th>
              <th>Description</th>
              <th appSortHeader class="num" field="price" label="Price" [sort]="sort()" (sortChange)="onSort($event)"></th>
              <th appSortHeader class="num" field="stock" label="Stock" [sort]="sort()" (sortChange)="onSort($event)"></th>
              <th appSortHeader field="updatedAt" label="Updated" [sort]="sort()" (sortChange)="onSort($event)"></th>
              @if (auth.isAdmin()) { <th class="actions">Actions</th> }
            </tr>
          </thead>
          <tbody>
            @for (p of result()?.items ?? []; track p.id) {
              <tr>
                <td class="muted">{{ p.id }}</td>
                <td>{{ p.name }}</td>
                <td class="truncate" [title]="p.description ?? ''">{{ p.description }}</td>
                <td class="num">{{ p.price | number: '1.2-2' }}</td>
                <td class="num">{{ p.stock }}</td>
                <td class="nowrap">{{ p.updatedAt | date: 'medium' }}</td>
                @if (auth.isAdmin()) {
                  <td class="actions">
                    <a [routerLink]="['/products', p.id, 'edit']" class="btn btn-small">Edit</a>
                    <button type="button" class="btn btn-small btn-danger" (click)="remove(p)">Delete</button>
                  </td>
                }
              </tr>
            } @empty {
              @if (result()) {
                <tr>
                  <td [attr.colspan]="auth.isAdmin() ? 7 : 6" class="empty">
                    {{ query().search ? 'No products match your search.' : 'No products yet.' }}
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
export class ProductsPage {
  private readonly products = inject(ProductService);
  protected readonly auth = inject(AuthService);

  protected readonly query = signal<ProductQuery>({ page: 1, pageSize: 20, sortBy: 'createdAt', sortDir: 'desc', search: '' });
  protected readonly sort = computed<SortState>(() => ({ sortBy: this.query().sortBy, sortDir: this.query().sortDir }));
  protected readonly result = signal<Page<Product> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly flash = signal(takeFlash());
  protected readonly search = new FormControl('', { nonNullable: true });
  private readonly reload = signal(0);

  constructor() {
    // A new search starts from page 1 once typing pauses.
    this.search.valueChanges
      .pipe(debounceTime(300), map((v) => v.trim()), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((search) => this.query.update((q) => ({ ...q, search, page: 1 })));

    // Re-fetch whenever the query or the reload counter changes; switchMap drops stale responses.
    toObservable(computed(() => ({ query: this.query(), reload: this.reload() })))
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap(({ query }) =>
          this.products.list(query).pipe(
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

  protected setPage(page: number): void {
    this.query.update((q) => ({ ...q, page }));
  }

  protected setPageSize(pageSize: number): void {
    this.query.update((q) => ({ ...q, pageSize, page: 1 }));
  }

  protected remove(product: Product): void {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    this.products.remove(product.id).subscribe({
      next: () => {
        this.flash.set(`Product "${product.name}" deleted.`);
        this.error.set(null);
        const lastOnPage = this.result()?.items.length === 1 && this.query().page > 1;
        if (lastOnPage) this.query.update((q) => ({ ...q, page: q.page - 1 }));
        else this.reload.update((n) => n + 1);
      },
      error: (err: unknown) => this.error.set(errorMessage(err)),
    });
  }
}
