import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { productApi } from '../api/productApi.js';
import Alert from '../components/Alert.jsx';

const EMPTY = { name: '', description: '', price: '', stock: '0' };

// Mirrors the Product Service rules.
function validate(form) {
  const errors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Name is required.';
  else if (name.length < 2 || name.length > 100) errors.name = 'Name must be 2–100 characters.';

  if (form.description.trim().length > 1000) errors.description = 'Description must be at most 1000 characters.';

  if (form.price.trim() === '') errors.price = 'Price is required.';
  else if (!/^\d+(\.\d{1,2})?$/.test(form.price.trim())) errors.price = 'Enter a number with at most 2 decimals.';
  else if (Number(form.price) < 0.01 || Number(form.price) > 999999.99) errors.price = 'Price must be 0.01–999999.99.';

  if (!/^\d+$/.test(form.stock.trim())) errors.stock = 'Stock must be a whole number.';
  else if (Number(form.stock) > 1000000) errors.stock = 'Stock must be 0–1000000.';
  return errors;
}

export default function ProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return undefined;
    const controller = new AbortController();
    productApi
      .get(id, controller.signal)
      .then(({ data }) => {
        setForm({
          name: data.name,
          description: data.description ?? '',
          price: String(data.price),
          stock: String(data.stock),
        });
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

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: Number(form.price),
      stock: Number(form.stock),
    };

    setSubmitting(true);
    try {
      if (isEdit) await productApi.update(id, payload);
      else await productApi.create(payload);
      navigate('/products', { state: { flash: `Product "${payload.name}" ${isEdit ? 'updated' : 'created'}.` } });
    } catch (err) {
      if (err.code === 'PRODUCT_NAME_TAKEN') setErrors({ name: err.message });
      else setServerError(err.message);
      setSubmitting(false);
    }
  };

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <section className="narrow">
      <h1>{isEdit ? 'Edit product' : 'New product'}</h1>
      <Alert type="error">{serverError}</Alert>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        <label>
          Name
          <input value={form.name} onChange={update('name')} maxLength={100} autoFocus />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </label>
        <label>
          Description <span className="muted">(optional)</span>
          <textarea rows={4} value={form.description} onChange={update('description')} maxLength={1000} />
          {errors.description && <span className="field-error">{errors.description}</span>}
        </label>
        <div className="row">
          <label>
            Price
            <input inputMode="decimal" value={form.price} onChange={update('price')} placeholder="0.00" />
            {errors.price && <span className="field-error">{errors.price}</span>}
          </label>
          <label>
            Stock
            <input inputMode="numeric" value={form.stock} onChange={update('stock')} />
            {errors.stock && <span className="field-error">{errors.stock}</span>}
          </label>
        </div>
        <div className="form-actions">
          <Link to="/products" className="btn btn-ghost">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </form>
    </section>
  );
}
