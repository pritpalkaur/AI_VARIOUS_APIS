import logger from '../utils/logger.js';
import { AppError, ErrorCodes } from '../utils/AppError.js';
import { sendError } from '../utils/apiResponse.js';

/**
 * Turns every error into the JSON error envelope. AppError messages are client-safe;
 * anything else is logged with context and returned as a generic 500, so stack traces and
 * SQL errors never reach the client.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    logger.error('Error after response started', { method: req.method, path: req.path, error: err?.message });
    return res.end();
  }

  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.code, err.message);
  }

  // Errors raised by express.json() while reading the body
  if (err?.type === 'entity.parse.failed') {
    return sendError(res, 400, ErrorCodes.INVALID_JSON, 'Request body is not valid JSON.');
  }
  if (err?.type === 'entity.too.large') {
    return sendError(res, 413, ErrorCodes.PAYLOAD_TOO_LARGE, 'Request body is too large.');
  }

  logger.error('Unhandled error', { method: req.method, path: req.path, error: err?.message, stack: err?.stack });
  return sendError(res, 500, ErrorCodes.INTERNAL_ERROR, 'An unexpected error occurred.');
}
