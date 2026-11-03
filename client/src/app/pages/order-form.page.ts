import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { ApiError, errorMessage } from '../core/api-error';
import { fromLocalInputValue, toLocalInputValue } from '../core/format';
import { ORDER_STATUSES, Order, OrderInput, OrderStatus } from '../core/models';
import { OrderService } from '../core/order.service';
import { ProductService } from '../core/product.service';
import { Alert } from '../shared/alert';

const PRODUCT_PICKER_LIMIT = 100; // the Product Service's max page size

type OrderErrors = Partial<Record<'productId' | 'quantity' | 'status' | 'orderDate', string>>;

interface ProductOption {
  id: number;
  name: string;
  price: number;
}

/** /orders/new and /orders/:id/edit. */
@Component({
  selector: 'app-order-form-page',
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, Alert],
  template: `
    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else {
      <section class="narrow">
        <h1>{{ isEdit() ? 'Edit order #' + id() : 'New order' }}</h1>
        <app-alert type="error" [message]="serverError()" />

        <form class="card form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label>
            Product
            <select formControlName="productId" autofocus>
              <option value="">— Choose a product —</option>
              @for (p of productOptions(); track p.id) {
                <option [value]="p.id">{{ p.name }} ({{ p.price | number: '1.2-2' }})</option>
              }
            </select>
            @if (moreProducts()) {
              <span class="hint">Showing the first {{ pickerLimit }} products by name.</span>
            }
            @if (errors().productId; as e) { <span class="field-error">{{ e }}</span> }
          </label>

          <div class="row">
            <label>
              Quantity
              <input formControlName="quantity" inputmode="numeric" />
              @if (errors().quantity; as e) { <span class="field-error">{{ e }}</span> }
            </label>
            <label>
              Status
              <select formControlName="status">
                @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
              </select>
              @if (errors().status; as e) { <span class="field-error">{{ e }}</span> }
            </label>
          </div>

          <label>
            Order date
            <input type="datetime-local" formControlName="orderDate" />
            @if (errors().orderDate; as e) { <span class="field-error">{{ e }}</span> }
          </label>

          @if (unitPrice() !== null) {
            <p class="summary">
              Unit price {{ unitPrice() | number: '1.2-2' }}
              @if (priceLocked()) { (locked at order time) }
              @if (estimatedTotal() !== null) {
                · Total <strong>{{ estimatedTotal() | number: '1.2-2' }}</strong>
              }
            </p>
          }

          <div class="form-actions">
            <a routerLink="/orders" class="btn btn-ghost">Cancel</a>
            <button type="submit" class="btn btn-primary" [disabled]="submitting()">
              {{ submitting() ? 'Saving…' : isEdit() ? 'Save changes' : 'Place order' }}
            </button>
          </div>
        </form>
      </section>
    }
  `,
})
export class OrderFormPage implements OnInit {
  private readonly orders = inject(OrderService);
  private readonly products = inject(ProductService);
  private readonly router = inject(Router);

  /** Route parameter :id (absent on /orders/new). */
  readonly id = input<string>();
  protected readonly isEdit = computed(() => Boolean(this.id()));
  protected readonly statuses = ORDER_STATUSES;
  protected readonly pickerLimit = PRODUCT_PICKER_LIMIT;

  protected readonly form = new FormGroup({
    productId: new FormControl('', { nonNullable: true }),
    quantity: new FormControl('1', { nonNullable: true }),
    status: new FormControl<OrderStatus>('Pending', { nonNullable: true }),
    orderDate: new FormControl(toLocalInputValue(), { nonNullable: true }),
  });
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  private readonly productList = signal<ProductOption[]>([]);
  private readonly existing = signal<Order | null>(null);
  protected readonly moreProducts = signal(false);
  protected readonly errors = signal<OrderErrors>({});
  protected readonly serverError = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);

  /** Keeps the order's current product selectable even if it is outside the first 100. */
  protected readonly productOptions = computed<ProductOption[]>(() => {
    const list = this.productList();
    const order = this.existing();
    if (order && !list.some((p) => p.id === order.productId)) {
      return [{ id: order.productId, name: order.productName, price: order.unitPrice }, ...list];
    }
    return list;
  });

  /** Keeping the same product keeps the price stored on the order. */
  protected readonly priceLocked = computed(() => {
    const order = this.existing();
    return order !== null && String(order.productId) === this.formValue().productId;
  });

  protected readonly unitPrice = computed<number | null>(() => {
    if (this.priceLocked()) return this.existing()!.unitPrice;
    const id = this.formValue().productId;
    return this.productOptions().find((p) => String(p.id) === id)?.price ?? null;
  });

  protected readonly estimatedTotal = computed<number | null>(() => {
    const price = this.unitPrice();
    const quantity = Number(this.formValue().quantity);
    return price !== null && Number.isInteger(quantity) && quantity > 0 ? price * quantity : null;
  });

  ngOnInit(): void {
    const id = this.id();
    forkJoin({
      products: this.products.list({ page: 1, pageSize: PRODUCT_PICKER_LIMIT, sortBy: 'name', sortDir: 'asc' }),
      order: id ? this.orders.get(id) : of(null),
    }).subscribe({
      next: ({ products, order }) => {
        this.productList.set(products.items.map((p) => ({ id: p.id, name: p.name, price: p.price })));
        this.moreProducts.set(products.pagination.totalItems > PRODUCT_PICKER_LIMIT);
        if (order) {
          this.existing.set(order);
          this.form.setValue({
            productId: String(order.productId),
            quantity: String(order.quantity),
            status: order.status,
            orderDate: toLocalInputValue(order.orderDate),
          });
        }
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.serverError.set(errorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected submit(): void {
    const value = this.form.getRawValue();
    const errors = validate(value);
    this.errors.set(errors);
    this.serverError.set(null);
    if (Object.keys(errors).length > 0) return;

    const payload: OrderInput = {
      productId: Number(value.productId),
      quantity: Number(value.quantity),
      status: value.status,
      orderDate: fromLocalInputValue(value.orderDate)!,
    };
    const id = this.id();
    const request = id ? this.orders.update(id, payload) : this.orders.create(payload);

    this.submitting.set(true);
    request.subscribe({
      next: (order) =>
        void this.router.navigate(['/orders'], { state: { flash: `Order #${order.id} ${id ? 'updated' : 'created'}.` } }),
      error: (err: unknown) => {
        if (err instanceof ApiError && err.code === 'PRODUCT_NOT_FOUND') this.errors.set({ productId: err.message });
        else this.serverError.set(errorMessage(err));
        this.submitting.set(false);
      },
    });
  }
}

/** Mirrors the Order Service rules. */
function validate(v: { productId: string; quantity: string; status: string; orderDate: string }): OrderErrors {
  const errors: OrderErrors = {};
  if (!v.productId) errors.productId = 'Choose a product.';
  if (!/^\d+$/.test(v.quantity.trim())) errors.quantity = 'Quantity must be a whole number.';
  else if (Number(v.quantity) < 1 || Number(v.quantity) > 10000) errors.quantity = 'Quantity must be 1–10000.';
  if (!(ORDER_STATUSES as readonly string[]).includes(v.status)) errors.status = 'Choose a status.';
  const iso = fromLocalInputValue(v.orderDate);
  if (!iso) errors.orderDate = 'Enter a valid date and time.';
  else {
    const year = new Date(iso).getUTCFullYear();
    if (year < 2000 || year > 2100) errors.orderDate = 'Year must be between 2000 and 2100.';
  }
  return errors;
}
