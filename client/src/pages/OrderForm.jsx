import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ORDER_STATUSES, orderApi } from '../api/orderApi.js';
import { productApi } from '../api/productApi.js';
import Alert from '../components/Alert.jsx';
import { formatMoney, fromLocalInputValue, toLocalInputValue } from '../utils/format.js';

const PRODUCT_PICKER_LIMIT = 100; // the Product Service's max page size

// Mirrors the Order Service rules.
function validate(form) {
  const errors = {};
  if (!form.productId) errors.productId = 'Choose a product.';
  if (!/^\d+$/.test(form.quantity.trim())) errors.quantity = 'Quantity must be a whole number.';
  else if (Number(form.quantity) < 1 || Number(form.quantity) > 10000) errors.quantity = 'Quantity must be 1–10000.';
  if (!ORDER_STATUSES.includes(form.status)) errors.status = 'Choose a status.';
  const iso = fromLocalInputValue(form.orderDate);
  if (!iso) errors.orderDate = 'Enter a valid date and time.';
  else {
    const year = new Date(iso).getUTCFullYear();
    if (year < 2000 || year > 2100) errors.orderDate = 'Year must be between 2000 and 2100.';
  }
  return errors;
}

export default function OrderForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState({ productId: '', quantity: '1', status: 'Pending', orderDate: toLocalInputValue() });
  const [existing, setExisting] = useState(null);
  const [products, setProducts] = useState([]);
  const [moreProducts, setMoreProducts] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const productsRequest = productApi.list(
      { page: 1, pageSize: PRODUCT_PICKER_LIMIT, sortBy: 'name', sortDir: 'asc' },
      controller.signal,
    );
    const orderRequest = isEdit ? orderApi.get(id, controller.signal) : Promise.resolve(null);

    Promise.all([productsRequest, orderRequest])
      .then(([productRes, orderRes]) => {
        setProducts(productRes.data.items);
        setMoreProducts(productRes.data.pagination.totalItems > PRODUCT_PICKER_LIMIT);
        if (orderRes) {
          const o = orderRes.data;
          setExisting(o);
          setForm({
            productId: String(o.productId),
            quantity: String(o.quantity),
            status: o.status,
            orderDate: toLocalInputValue(o.orderDate),
          });
        }
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setServerError(err.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [id, isEdit]);

  // Keep the order's current product selectable even if it is outside the first 100.
  const productOptions = useMemo(() => {
    if (existing && !products.some((p) => p.id === existing.productId)) {
      return [{ id: existing.productId, name: existing.productName, price: existing.unitPrice }, ...products];
    }
    return products;
  }, [products, existing]);

  // Price shown in the summary: a kept product keeps its locked-in unit price.
  const unitPrice = useMemo(() => {
    if (existing && String(existing.productId) === form.productId) return existing.unitPrice;
    return productOptions.find((p) => String(p.id) === form.productId)?.price ?? null;
  }, [existing, form.productId, productOptions]);
  const quantity = Number(form.quantity);
  const estimatedTotal = unitPrice !== null && Number.isInteger(quantity) && quantity > 0 ? unitPrice * quantity : null;

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    const payload = {
      productId: Number(form.productId),
      quantity: Number(form.quantity),
      status: form.status,
      orderDate: fromLocalInputValue(form.orderDate),
    };

    setSubmitting(true);
    try {
      const { data } = isEdit ? await orderApi.update(id, payload) : await orderApi.create(payload);
      navigate('/orders', { state: { flash: `Order #${data.id} ${isEdit ? 'updated' : 'created'}.` } });
    } catch (err) {
      if (err.code === 'PRODUCT_NOT_FOUND') setErrors({ productId: err.message });
      else setServerError(err.message);
      setSubmitting(false);
    }
  };

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <section className="narrow">
      <h1>{isEdit ? `Edit order #${id}` : 'New order'}</h1>
      <Alert type="error">{serverError}</Alert>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        <label>
          Product
          <select value={form.productId} onChange={update('productId')} autoFocus>
            <option value="">— Choose a product —</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({formatMoney(p.price)})
              </option>
            ))}
          </select>
          {moreProducts && <span className="hint">Showing the first {PRODUCT_PICKER_LIMIT} products by name.</span>}
          {errors.productId && <span className="field-error">{errors.productId}</span>}
        </label>

        <div className="row">
          <label>
            Quantity
            <input inputMode="numeric" value={form.quantity} onChange={update('quantity')} />
            {errors.quantity && <span className="field-error">{errors.quantity}</span>}
          </label>
          <label>
            Status
            <select value={form.status} onChange={update('status')}>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {errors.status && <span className="field-error">{errors.status}</span>}
          </label>
        </div>

        <label>
          Order date
          <input type="datetime-local" value={form.orderDate} onChange={update('orderDate')} />
          {errors.orderDate && <span className="field-error">{errors.orderDate}</span>}
        </label>

        {unitPrice !== null && (
          <p className="summary">
            Unit price {formatMoney(unitPrice)}
            {existing && String(existing.productId) === form.productId && ' (locked at order time)'}
            {estimatedTotal !== null && <> · Total <strong>{formatMoney(estimatedTotal)}</strong></>}
          </p>
        )}

        <div className="form-actions">
          <Link to="/orders" className="btn btn-ghost">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Place order'}
          </button>
        </div>
      </form>
    </section>
  );
}
