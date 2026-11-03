import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// This service's own .env (optional overrides) first, then the shared ../.env used by every
// service. The first file to set a value wins, and real environment variables win over both
// (dotenv does not override by default).
dotenv.config({ path: [path.join(projectRoot, '.env'), path.join(projectRoot, '..', '.env')], quiet: true });

const errors = [];

function required(name, { trim = true } = {}) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    errors.push(`${name} is required`);
    return '';
  }
  return trim ? value.trim() : value;
}

function optional(name, defaultValue) {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? defaultValue : value.trim();
}

function int(name, defaultValue, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${name} must be an integer between ${min} and ${max}`);
    return defaultValue;
  }
  return value;
}

function serviceUrl(name, defaultValue) {
  const value = optional(name, defaultValue);
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
  } catch {
    errors.push(`${name} must be an absolute http(s) URL`);
  }
  return value.replace(/\/+$/, '');
}

function bool(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const value = raw.trim().toLowerCase();
  if (value !== 'true' && value !== 'false') {
    errors.push(`${name} must be true or false`);
    return defaultValue;
  }
  return value === 'true';
}

const config = {
  port: int('PORT', 5002, 1, 65535),
  corsOrigins: optional('CORS_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  db: {
    server: required('DB_SERVER'),
    port: int('DB_PORT', 1433, 1, 65535),
    database: optional('DB_NAME', 'ProductApiDb'), // this service's own database
    user: required('DB_USER'),
    password: required('DB_PASSWORD', { trim: false }),
    trustServerCertificate: bool('DB_TRUST_SERVER_CERT', false),
    poolMin: int('DB_POOL_MIN', 0, 0, 100),
    poolMax: int('DB_POOL_MAX', 10, 1, 200),
    connectTimeoutMs: int('DB_CONNECT_TIMEOUT_MS', 15000, 1000, 120000),
    requestTimeoutMs: int('DB_REQUEST_TIMEOUT_MS', 15000, 1000, 300000),
  },

  // The Order Service owns orders (OrderApiDb); we ask it before deleting a product.
  orderService: {
    url: serviceUrl('ORDER_SERVICE_URL', 'http://127.0.0.1:5003'),
    timeoutMs: int('SERVICE_CALL_TIMEOUT_MS', 5000, 500, 60000),
  },

  jwt: {
    secret: required('JWT_SECRET', { trim: false }),
    issuer: required('JWT_ISSUER'),
    audience: required('JWT_AUDIENCE'),
  },

  log: {
    level: optional('LOG_LEVEL', 'info'),
    dir: path.resolve(projectRoot, optional('LOG_DIR', 'logs')),
  },
};

if (config.jwt.secret && config.jwt.secret.length < 32) {
  errors.push('JWT_SECRET must be at least 32 characters');
}
if (config.jwt.secret.toLowerCase().startsWith('replace_with')) {
  errors.push('JWT_SECRET still has the placeholder value from .env.example');
}
if (config.db.poolMin > config.db.poolMax) {
  errors.push('DB_POOL_MIN must not be greater than DB_POOL_MAX');
}

export const configErrors = Object.freeze([...errors]);
export default Object.freeze(config);
