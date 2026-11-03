/**
 * Error that is safe to show to the client. errorHandler renders it as
 * { success: false, error: { code, message } } with the given HTTP status.
 */
export class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }

  static validation(message) {
    return new AppError(400, ErrorCodes.VALIDATION_ERROR, message);
  }

  static unauthorized(message = 'Missing or invalid access token.') {
    return new AppError(401, ErrorCodes.UNAUTHORIZED, message);
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new AppError(403, ErrorCodes.FORBIDDEN, message);
  }

  static notFound(code, message) {
    return new AppError(404, code, message);
  }

  static conflict(code, message) {
    return new AppError(409, code, message);
  }

  /** Another service we depend on could not be reached or answered unexpectedly. */
  static serviceUnavailable(serviceName) {
    return new AppError(503, `${serviceName.toUpperCase()}_SERVICE_UNAVAILABLE`,
      `The ${serviceName} service is unavailable. Please try again later.`);
  }

  static internal() {
    return new AppError(500, ErrorCodes.INTERNAL_ERROR, 'An unexpected error occurred.');
  }
}

/**
 * Thrown by repositories. The driver error is logged where it happens and kept as
 * `cause`, so SQL details never travel past the service layer.
 */
export class DataAccessError extends Error {
  constructor(operation, message, { cause, kind = 'UNKNOWN', constraint = null } = {}) {
    super(message, { cause });
    this.name = 'DataAccessError';
    this.operation = operation;
    this.kind = kind; // 'UNIQUE_VIOLATION' | 'FOREIGN_KEY_VIOLATION' | 'UNKNOWN'
    this.constraint = constraint;
  }
}

export const ErrorCodes = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PRODUCT_NAME_TAKEN: 'PRODUCT_NAME_TAKEN',
  PRODUCT_HAS_ORDERS: 'PRODUCT_HAS_ORDERS',
  ORDER_SERVICE_UNAVAILABLE: 'ORDER_SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});
