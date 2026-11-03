import { request } from './http.js';

export const productApi = {
  /** query: { page, pageSize, sortBy, sortDir, search } */
  list: (query, signal) => request('product', '/api/products', { query, signal }),
  get: (id, signal) => request('product', `/api/products/${id}`, { signal }),
  create: (product) => request('product', '/api/products', { method: 'POST', body: product }),
  update: (id, product) => request('product', `/api/products/${id}`, { method: 'PUT', body: product }),
  remove: (id) => request('product', `/api/products/${id}`, { method: 'DELETE' }),
};
