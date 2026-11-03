import express from 'express';
import cors from 'cors';
import config from './config/env.js';
import productRoutes from './routes/product.routes.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { sendSuccess } from './utils/apiResponse.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    sendSuccess(res, 200, { status: 'ok', service: 'product-service' }, 'Service is healthy.');
  });

  app.use('/api/products', productRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
