import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ORDER_STATUSES, orderApi } from '../api/orderApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import Alert from '../components/Alert.jsx';
import Pagination from '../components/Pagination.jsx';
import SortHeader from '../components/SortHeader.jsx';
import { formatDateTime, formatMoney } from '../utils/format.js';

export default function OrdersPage() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [query, setQuery] = useState({ page: 1, pageSize: 20, sortBy: 'orderDate', sortDir: 'desc', status: '' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(location.state?.flash ?? null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (location.state?.flash) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    orderApi
      .list(query, controller.signal)
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
  }, [query, reloadKey]);

  const handleDelete = async (order) => {
    if (!window.confirm(`Delete order #${order.id} (${order.productName})? This cannot be undone.`)) return;
    try {
      await orderApi.remove(order.id);
      setFlash(`Order #${order.id} deleted.`);
      setError(null);
      if (result.items.length === 1 && query.page > 1) setQuery((q) => ({ ...q, page: q.page - 1 }));
      else setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  const sort = { sortBy: query.sortBy, sortDir: query.sortDir };
  const onSort = (next) => setQuery((q) => ({ ...q, ...next, page: 1 }));
  const columnCount = isAdmin ? 9 : 8;

  return (
    <section>
      <div className="page-header">
        <h1>{isAdmin ? 'All orders' : 'My orders'}</h1>
        <Link to="/orders/new" className="btn btn-primary">
          + New order
        </Link>
      </div>

      <Alert type="success" onClose={() => setFlash(null)}>{flash}</Alert>
      <Alert type="error" onClose={() => setError(null)}>{error}</Alert>

      <div className="toolbar">
        <label className="inline">
          Status
          <select value={query.status} onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value, page: 1 }))}>
            <option value="">All</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table className={loading ? 'loading' : undefined}>
          <thead>
            <tr>
              <SortHeader field="id" label="#" sort={sort} onSort={onSort} />
              <th>Product</th>
              {isAdmin && <th>Customer</th>}
              <SortHeader field="quantity" label="Qty" sort={sort} onSort={onSort} className="num" />
              <th className="num">Unit price</th>
              <SortHeader field="totalPrice" label="Total" sort={sort} onSort={onSort} className="num" />
              <SortHeader field="status" label="Status" sort={sort} onSort={onSort} />
              <SortHeader field="orderDate" label="Order date" sort={sort} onSort={onSort} />
              <th className="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {result?.items.map((o) => (
              <tr key={o.id}>
                <td className="muted">{o.id}</td>
                <td>{o.productName}</td>
                {isAdmin && <td>{o.username}</td>}
                <td className="num">{o.quantity}</td>
                <td className="num">{formatMoney(o.unitPrice)}</td>
                <td className="num">{formatMoney(o.totalPrice)}</td>
                <td>
                  <span className={`status status-${o.status.toLowerCase()}`}>{o.status}</span>
                </td>
                <td className="nowrap">{formatDateTime(o.orderDate)}</td>
                <td className="actions">
                  <Link to={`/orders/${o.id}/edit`} className="btn btn-small">Edit</Link>
                  <button type="button" className="btn btn-small btn-danger" onClick={() => handleDelete(o)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {result && result.items.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="empty">
                  {query.status ? `No ${query.status.toLowerCase()} orders.` : 'No orders yet.'}
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
