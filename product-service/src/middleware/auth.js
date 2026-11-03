import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

/**
 * Validates "Authorization: Bearer <token>" using the same secret/issuer/audience as the
 * Auth Service, then sets req.user = { id, username, role }. The token is never logged.
 */
export function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw AppError.unauthorized('Missing or invalid access token.');
    }

    let claims;
    try {
      claims = jwt.verify(token, config.jwt.secret, {
        algorithms: ['HS256'],
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
        clockTolerance: 30,
      });
    } catch (err) {
      logger.info('JWT validation failed', { reason: err.name, path: req.path });
      throw AppError.unauthorized(
        err.name === 'TokenExpiredError' ? 'Access token has expired.' : 'Missing or invalid access token.',
      );
    }

    const id = Number(claims.sub);
    if (!Number.isInteger(id) || id < 1 || typeof claims.role !== 'string') {
      throw AppError.unauthorized('Missing or invalid access token.');
    }

    req.user = { id, username: claims.username, role: claims.role };
    next();
  } catch (err) {
    next(err);
  }
}
