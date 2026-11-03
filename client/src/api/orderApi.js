import { request } from './http.js';

export const ORDER_STATUSES = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];

export const orderApi = {
  /** query: { page, pageSize, sortBy, sortDir, status } */
  list: (query, signal) => request('order', '/api/orders', { query, signal }),
  get: (id, signal) => request('order', `/api/orders/${id}`, { signal }),
  create: (order) => request('order', '/api/orders', { method: 'POST', body: order }),
  update: (id, order) => request('order', `/api/orders/${id}`, { method: 'PUT', body: order }),
  remove: (id) => request('order', `/api/orders/${id}`, { method: 'DELETE' }),
};
