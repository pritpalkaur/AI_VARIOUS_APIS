import { performance } from 'node:perf_hooks';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

/**
 * Asks the Order Service how many orders reference a product
 * (GET /api/orders?productId=..&pageSize=1 -> data.pagination.totalItems).
 *
 * Orders live in the Order Service's own database, so this is an API call, not SQL. The
 * caller's Authorization header is forwarded: product deletes are Admin-only, and an Admin
 * sees every order. Any failure becomes a 503, so a product is never deleted unchecked.
 */
export async function countOrdersForProduct(productId, authorization) {
  const url = new URL('/api/orders', config.orderService.url);
  url.searchParams.set('productId', String(productId));
  url.searchParams.set('pageSize', '1');

  const startedAt = performance.now();
  try {
    const res = await fetch(url, {
      headers: { Authorization: authorization ?? '', Accept: 'application/json' },
      signal: AbortSignal.timeout(config.orderService.timeoutMs),
    });
    const body = await res.json().catch(() => null);
    const total = body?.data?.pagination?.totalItems;
    if (res.ok && body?.success && Number.isInteger(total)) return total;

    logger.error('Order service returned an unexpected response', { status: res.status, code: body?.error?.code });
    throw AppError.serviceUnavailable('Order');
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('Order service call failed', { error: err.message, name: err.name });
    throw AppError.serviceUnavailable('Order');
  } finally {
    logger.debug('Order service call finished', { durationMs: Math.round(performance.now() - startedAt) });
  }
}
