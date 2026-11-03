import sql from 'mssql';
import config from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * One connection pool for the whole process: created once in server.js at startup,
 * closed once on graceful shutdown.
 *
 * How connections are released with `mssql`: pool.request().query(...) checks out a
 * connection for that single query and returns it to the pool when the query settles -
 * on success, on error and on cancel. (If a future repository needs a Transaction, it holds
 * one connection from begin() until commit()/rollback(); roll back in `finally` when not
 * committed so the connection is always handed back.)
 */
let pool = null;

export async function initPool() {
  if (pool) return pool;

  const newPool = new sql.ConnectionPool({
    server: config.db.server,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    connectionTimeout: config.db.connectTimeoutMs,
    requestTimeout: config.db.requestTimeoutMs,
    options: {
      encrypt: true,
      trustServerCertificate: config.db.trustServerCertificate,
      appName: 'product-service',
    },
    pool: {
      min: config.db.poolMin,
      max: config.db.poolMax,
      idleTimeoutMillis: 30000,
    },
  });

  newPool.on('error', (err) => {
    logger.error('SQL connection pool error', { error: err.message, code: err.code });
  });

  try {
    await newPool.connect();
    pool = newPool;
    logger.info('Connected to SQL Server', {
      server: `${config.db.server},${config.db.port}`,
      database: config.db.database,
      poolMax: config.db.poolMax,
    });
    return pool;
  } catch (err) {
    logger.error('Cannot connect to SQL Server', {
      server: `${config.db.server},${config.db.port}`,
      database: config.db.database,
      error: err.message,
      code: err.code,
    });
    throw err;
  }
}

export function getPool() {
  if (!pool) throw new Error('Connection pool has not been initialised.');
  return pool;
}

export async function closePool() {
  if (!pool) return;
  try {
    await pool.close();
    logger.info('SQL connection pool closed');
  } catch (err) {
    logger.error('Error while closing SQL connection pool', { error: err.message });
  } finally {
    pool = null;
  }
}

export { sql };
