/*
 * Small fetch wrapper shared by every API module:
 *  - sends every request to the API gateway, which routes it to the right service,
 *  - adds "Authorization: Bearer <token>" when a token is stored,
 *  - unwraps the shared envelope { success, data, message } / { success, error },
 *  - throws ApiError for HTTP errors and network failures,
 *  - on 401 for an authenticated call, notifies AuthContext so it can log out.
 */

export const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL ?? 'http://localhost:5000';

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
 * @param {string} path e.g. '/api/products' - the gateway routes /api/auth, /api/products, /api/orders
 * @param {{ method?: string, body?: unknown, query?: Record<string, unknown>, signal?: AbortSignal }} options
 */
export async function request(path, { method = 'GET', body, query, signal } = {}) {
  const url = new URL(path, API_GATEWAY_URL);
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
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the API gateway. Is it running on port 5000?');
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
