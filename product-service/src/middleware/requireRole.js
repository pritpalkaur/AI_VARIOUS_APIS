import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/** Must run after authenticate. Responds 403 when req.user.role is not in `roles`. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      logger.info('Forbidden: role not allowed', { userId: req.user?.id, role: req.user?.role, method: req.method, path: req.path });
      return next(AppError.forbidden());
    }
    return next();
  };
}
