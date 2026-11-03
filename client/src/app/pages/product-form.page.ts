import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError, errorMessage } from '../core/api-error';
import { ProductInput } from '../core/models';
import { ProductService } from '../core/product.service';
import { Alert } from '../shared/alert';

type ProductErrors = Partial<Record<'name' | 'description' | 'price' | 'stock', string>>;

/** /products/new and /products/:id/edit (Admin only - see adminGuard). */
@Component({
  selector: 'app-product-form-page',
  imports: [ReactiveFormsModule, RouterLink, Alert],
  template: `
    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else {
      <section class="narrow">
        <h1>{{ isEdit() ? 'Edit product' : 'New product' }}</h1>
        <app-alert type="error" [message]="serverError()" />

        <form class="card form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label>
            Name
            <input formControlName="name" maxlength="100" autofocus />
            @if (errors().name; as e) { <span class="field-error">{{ e }}</span> }
          </label>
          <label>
            Description <span class="muted">(optional)</span>
            <textarea rows="4" formControlName="description" maxlength="1000"></textarea>
            @if (errors().description; as e) { <span class="field-error">{{ e }}</span> }
          </label>
          <div class="row">
            <label>
              Price
              <input formControlName="price" inputmode="decimal" placeholder="0.00" />
              @if (errors().price; as e) { <span class="field-error">{{ e }}</span> }
            </label>
            <label>
              Stock
              <input formControlName="stock" inputmode="numeric" />
              @if (errors().stock; as e) { <span class="field-error">{{ e }}</span> }
            </label>
          </div>
          <div class="form-actions">
            <a routerLink="/products" class="btn btn-ghost">Cancel</a>
            <button type="submit" class="btn btn-primary" [disabled]="submitting()">
              {{ submitting() ? 'Saving…' : isEdit() ? 'Save changes' : 'Create product' }}
            </button>
          </div>
        </form>
      </section>
    }
  `,
})
export class ProductFormPage implements OnInit {
  private readonly products = inject(ProductService);
  private readonly router = inject(Router);

  /** Route parameter :id (absent on /products/new). */
  readonly id = input<string>();
  protected readonly isEdit = computed(() => Boolean(this.id()));

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    price: new FormControl('', { nonNullable: true }),
    stock: new FormControl('0', { nonNullable: true }),
  });
  protected readonly errors = signal<ProductErrors>({});
  protected readonly serverError = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);

  ngOnInit(): void {
    const id = this.id();
    if (!id) return;
    this.loading.set(true);
    this.products.get(id).subscribe({
      next: (p) => {
        this.form.setValue({ name: p.name, description: p.description ?? '', price: String(p.price), stock: String(p.stock) });
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

    const payload: ProductInput = {
      name: value.name.trim(),
      description: value.description.trim() || null,
      price: Number(value.price),
      stock: Number(value.stock),
    };
    const id = this.id();
    const request = id ? this.products.update(id, payload) : this.products.create(payload);

    this.submitting.set(true);
    request.subscribe({
      next: () =>
        void this.router.navigate(['/products'], {
          state: { flash: `Product "${payload.name}" ${id ? 'updated' : 'created'}.` },
        }),
      error: (err: unknown) => {
        if (err instanceof ApiError && err.code === 'PRODUCT_NAME_TAKEN') this.errors.set({ name: err.message });
        else this.serverError.set(errorMessage(err));
        this.submitting.set(false);
      },
    });
  }
}

/** Mirrors the Product Service rules. */
function validate(v: { name: string; description: string; price: string; stock: string }): ProductErrors {
  const errors: ProductErrors = {};
  const name = v.name.trim();
  if (!name) errors.name = 'Name is required.';
  else if (name.length < 2 || name.length > 100) errors.name = 'Name must be 2–100 characters.';

  if (v.description.trim().length > 1000) errors.description = 'Description must be at most 1000 characters.';

  const price = v.price.trim();
  if (!price) errors.price = 'Price is required.';
  else if (!/^\d+(\.\d{1,2})?$/.test(price)) errors.price = 'Enter a number with at most 2 decimals.';
  else if (Number(price) < 0.01 || Number(price) > 999999.99) errors.price = 'Price must be 0.01–999999.99.';

  if (!/^\d+$/.test(v.stock.trim())) errors.stock = 'Stock must be a whole number.';
  else if (Number(v.stock) > 1000000) errors.stock = 'Stock must be 0–1000000.';
  return errors;
}
