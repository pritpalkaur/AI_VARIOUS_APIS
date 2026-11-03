import { request } from './http.js';

export const authApi = {
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: { username, password } }),

  register: ({ username, email, password }) =>
    request('/api/auth/register', { method: 'POST', body: { username, email, password } }),

  me: () => request('/api/auth/me'),
};
