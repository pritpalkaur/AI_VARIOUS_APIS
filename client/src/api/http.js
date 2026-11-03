/*
 * Small fetch wrapper shared by every API module:
 *  - adds "Authorization: Bearer <token>" when a token is stored,
 *  - unwraps the shared envelope { success, data, message } / { success, error },
 *  - throws ApiError for HTTP errors and network failures,
 *  - on 401 for an authenticated call, notifies AuthContext so it can log out.
 */

export const SERVICE_URLS = {
  auth: import.meta.env.VITE_AUTH_URL ?? 'http://localhost:5001',
  product: import.meta.env.VITE_PRODUCT_URL ?? 'http://localhost:5002',
  order: import.meta.env.VITE_ORDER_URL ?? 'http://localhost:5003',
};

const SERVICE_NAMES = { auth: 'Auth', product: 'Product', order: 'Order' };

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let getToken = () => null;
let onUnauthorized = () => {};

/** Called once by AuthContext so this module can read the token and report expiry. */
export function configureHttp({ tokenProvider, unauthorizedHandler }) {
  getToken = tokenProvider;
  onUnauthorized = unauthorizedHandler;
}

/**
 * @param {'auth'|'product'|'order'} service
 * @param {string} path e.g. '/api/products'
 * @param {{ method?: string, body?: unknown, query?: Record<string, unknown>, signal?: AbortSignal }} options
 */
export async function request(service, path, { method = 'GET', body, query, signal } = {}) {
  const url = new URL(path, SERVICE_URLS[service]);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', `Cannot reach the ${SERVICE_NAMES[service]} service. Is it running?`);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body (should not happen with these APIs) - handled below.
  }

  if (response.ok && payload?.success) {
    return { data: payload.data, message: payload.message };
  }

  if (response.status === 401 && token) onUnauthorized();

  throw new ApiError(
    response.status,
    payload?.error?.code ?? 'UNKNOWN_ERROR',
    payload?.error?.message ?? `Request failed with status ${response.status}.`,
  );
}
