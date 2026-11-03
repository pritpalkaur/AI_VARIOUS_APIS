import { request } from './http.js';

export const ORDER_STATUSES = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];

export const orderApi = {
  /** query: { page, pageSize, sortBy, sortDir, status } */
  list: (query, signal) => request('/api/orders', { query, signal }),
  get: (id, signal) => request(`/api/orders/${id}`, { signal }),
  create: (order) => request('/api/orders', { method: 'POST', body: order }),
  update: (id, order) => request(`/api/orders/${id}`, { method: 'PUT', body: order }),
  remove: (id) => request(`/api/orders/${id}`, { method: 'DELETE' }),
};
