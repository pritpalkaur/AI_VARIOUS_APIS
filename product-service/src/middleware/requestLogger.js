import { performance } from 'node:perf_hooks';
import logger from '../utils/logger.js';

/**
 * One log line per request: method, path, status, duration.
 * Only the path is logged - never headers (Authorization), query strings or bodies.
 */
export function requestLogger(req, res, next) {
  const startedAt = performance.now();
  const path = req.originalUrl.split('?')[0];
  let logged = false;

  const log = (aborted) => {
    if (logged) return;
    logged = true;
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const meta = { method: req.method, path, statusCode, durationMs: Number((performance.now() - startedAt).toFixed(1)) };
    if (aborted) {
      logger.info(`HTTP ${req.method} ${path} aborted by client`, meta);
    } else {
      logger.log(level, `HTTP ${req.method} ${path} responded ${statusCode}`, meta);
    }
  };

  res.on('finish', () => log(false));
  res.on('close', () => log(!res.writableFinished));
  next();
}
