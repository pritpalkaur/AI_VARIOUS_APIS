import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { productApi } from '../api/productApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import Alert from '../components/Alert.jsx';
import Pagination from '../components/Pagination.jsx';
import SortHeader from '../components/SortHeader.jsx';
import { formatDateTime, formatMoney } from '../utils/format.js';

export default function ProductsPage() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [query, setQuery] = useState({ page: 1, pageSize: 20, sortBy: 'createdAt', sortDir: 'desc' });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(location.state?.flash ?? null);
  const [reloadKey, setReloadKey] = useState(0);

  // Clear router state so the flash message doesn't reappear on reload.
  useEffect(() => {
    if (location.state?.flash) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  // A new search starts from page 1.
  useEffect(() => {
    setQuery((q) => (q.page === 1 ? q : { ...q, page: 1 }));
  }, [debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    productApi
      .list({ ...query, search: debouncedSearch }, controller.signal)
      .then(({ data }) => {
        setResult(data);
        setError(null);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, debouncedSearch, reloadKey]);

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      await productApi.remove(product.id);
      setFlash(`Product "${product.name}" deleted.`);
      setError(null);
      if (result.items.length === 1 && query.page > 1) setQuery((q) => ({ ...q, page: q.page - 1 }));
      else setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  const sort = { sortBy: query.sortBy, sortDir: query.sortDir };
  const onSort = (next) => setQuery((q) => ({ ...q, ...next, page: 1 }));

  return (
    <section>
      <div className="page-header">
        <h1>Products</h1>
        {isAdmin && (
          <Link to="/products/new" className="btn btn-primary">
            + New product
          </Link>
        )}
      </div>

      <Alert type="success" onClose={() => setFlash(null)}>{flash}</Alert>
      <Alert type="error" onClose={() => setError(null)}>{error}</Alert>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search by name…"
          value={search}
          maxLength={100}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search products by name"
        />
      </div>

      <div className="table-wrap">
        <table className={loading ? 'loading' : undefined}>
          <thead>
            <tr>
              <SortHeader field="id" label="#" sort={sort} onSort={onSort} />
              <SortHeader field="name" label="Name" sort={sort} onSort={onSort} />
              <th>Description</th>
              <SortHeader field="price" label="Price" sort={sort} onSort={onSort} className="num" />
              <SortHeader field="stock" label="Stock" sort={sort} onSort={onSort} className="num" />
              <SortHeader field="updatedAt" label="Updated" sort={sort} onSort={onSort} />
              {isAdmin && <th className="actions">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {result?.items.map((p) => (
              <tr key={p.id}>
                <td className="muted">{p.id}</td>
                <td>{p.name}</td>
                <td className="truncate" title={p.description ?? ''}>{p.description}</td>
                <td className="num">{formatMoney(p.price)}</td>
                <td className="num">{p.stock}</td>
                <td className="nowrap">{formatDateTime(p.updatedAt)}</td>
                {isAdmin && (
                  <td className="actions">
                    <Link to={`/products/${p.id}/edit`} className="btn btn-small">Edit</Link>
                    <button type="button" className="btn btn-small btn-danger" onClick={() => handleDelete(p)}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {result && result.items.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="empty">
                  {debouncedSearch ? 'No products match your search.' : 'No products yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        pagination={result?.pagination}
        onPageChange={(page) => setQuery((q) => ({ ...q, page }))}
        onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, page: 1 }))}
      />
    </section>
  );
}
