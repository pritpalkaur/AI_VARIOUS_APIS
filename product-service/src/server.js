import config, { configErrors } from './config/env.js';
import logger from './utils/logger.js';
import { initPool, closePool } from './db/pool.js';
import { createApp } from './app.js';

const SHUTDOWN_TIMEOUT_MS = 10000;
let server = null;
let shuttingDown = false;

async function start() {
  if (configErrors.length > 0) {
    logger.error(`Invalid configuration: ${configErrors.join('; ')}`);
    await flushLogsAndExit(1);
    return;
  }

  logger.info('Product service starting', { logLevel: config.log.level });

  try {
    await initPool(); // the one pool for this process
  } catch {
    logger.error('Product service failed to start: database unavailable');
    await flushLogsAndExit(1);
    return;
  }

  server = createApp().listen(config.port, 'localhost', () => {
    logger.info(`Product service listening on http://localhost:${config.port}`);
  });

  server.on('error', async (err) => {
    logger.error('HTTP server error', { error: err.message, code: err.code });
    await shutdown('server error', 1);
  });
}

async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Product service shutting down', { reason });

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    if (server) {
      // Stop accepting new connections and wait for in-flight requests to finish.
      await new Promise((resolve) => server.close(() => resolve()));
    }
    await closePool();
    logger.info('Product service stopped');
  } catch (err) {
    logger.error('Error during shutdown', { error: err.message });
    exitCode = 1;
  } finally {
    await flushLogsAndExit(exitCode);
  }
}

function flushLogsAndExit(code) {
  return new Promise((resolve) => {
    logger.on('finish', () => {
      resolve();
      process.exit(code);
    });
    logger.end();
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: reason?.message ?? String(reason), stack: reason?.stack });
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  shutdown('uncaughtException', 1);
});

start();
