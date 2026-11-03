import { request } from './http.js';

export const productApi = {
  /** query: { page, pageSize, sortBy, sortDir, search } */
  list: (query, signal) => request('/api/products', { query, signal }),
  get: (id, signal) => request(`/api/products/${id}`, { signal }),
  create: (product) => request('/api/products', { method: 'POST', body: product }),
  update: (id, product) => request(`/api/products/${id}`, { method: 'PUT', body: product }),
  remove: (id) => request(`/api/products/${id}`, { method: 'DELETE' }),
};
