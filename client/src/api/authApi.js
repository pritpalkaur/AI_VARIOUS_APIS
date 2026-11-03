import { request } from './http.js';

export const authApi = {
  login: (username, password) =>
    request('auth', '/api/auth/login', { method: 'POST', body: { username, password } }),

  register: ({ username, email, password }) =>
    request('auth', '/api/auth/register', { method: 'POST', body: { username, email, password } }),

  me: () => request('auth', '/api/auth/me'),
};
