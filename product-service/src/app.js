import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import config from './config/env.js';
import productRoutes from './routes/product.routes.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { sendSuccess } from './utils/apiResponse.js';

const OPENAPI_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'openapi.yaml');

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    sendSuccess(res, 200, { status: 'ok', service: 'product-service' }, 'Service is healthy.');
  });

  // API documentation: hand-written OpenAPI spec + Swagger UI (assets bundled, no CDN)
  app.get('/openapi.yaml', (req, res) => res.type('application/yaml').sendFile(OPENAPI_PATH));
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(null, { swaggerOptions: { url: '/openapi.yaml' }, customSiteTitle: 'Product Service API' }),
  );

  app.use('/api/products', productRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
