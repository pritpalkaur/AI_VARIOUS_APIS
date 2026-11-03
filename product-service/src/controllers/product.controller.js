import * as productService from '../services/product.service.js';
import { validateId, validateListQuery, validateProductBody } from '../validators/product.validator.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/*
 * HTTP layer: validate input, call the service, send the JSON envelope.
 * Every handler uses try/catch/finally; errors go to errorHandler via next(err).
 * Handlers never touch the database directly, so they hold no connection to release -
 * `finally` records the handler outcome at debug level.
 */

function assertValid({ errors }) {
  if (errors.length > 0) throw AppError.validation(errors.join(' '));
}

function logHandlerDone(handler, req, res) {
  logger.debug('Handler finished', { handler, method: req.method, path: req.path, statusCode: res.statusCode });
}

export async function listProducts(req, res, next) {
  try {
    const query = validateListQuery(req.query);
    assertValid(query);
    const result = await productService.listProducts(query.value);
    sendSuccess(res, 200, result, 'Products retrieved.');
  } catch (err) {
    next(err);
  } finally {
    logHandlerDone('listProducts', req, res);
  }
}

export async function getProduct(req, res, next) {
  try {
    const id = validateId(req.params.id);
    assertValid(id);
    const product = await productService.getProduct(id.value);
    sendSuccess(res, 200, product, 'Product retrieved.');
  } catch (err) {
    next(err);
  } finally {
    logHandlerDone('getProduct', req, res);
  }
}

export async function createProduct(req, res, next) {
  try {
    const body = validateProductBody(req.body);
    assertValid(body);
    const product = await productService.createProduct(body.value, req.user);
    res.location(`/api/products/${product.id}`);
    sendSuccess(res, 201, product, 'Product created.');
  } catch (err) {
    next(err);
  } finally {
    logHandlerDone('createProduct', req, res);
  }
}

export async function updateProduct(req, res, next) {
  try {
    const id = validateId(req.params.id);
    const body = validateProductBody(req.body);
    assertValid({ errors: [...id.errors, ...body.errors] });
    const product = await productService.updateProduct(id.value, body.value, req.user);
    sendSuccess(res, 200, product, 'Product updated.');
  } catch (err) {
    next(err);
  } finally {
    logHandlerDone('updateProduct', req, res);
  }
}

export async function deleteProduct(req, res, next) {
  try {
    const id = validateId(req.params.id);
    assertValid(id);
    const result = await productService.deleteProduct(id.value, req.user);
    sendSuccess(res, 200, result, 'Product deleted.');
  } catch (err) {
    next(err);
  } finally {
    logHandlerDone('deleteProduct', req, res);
  }
}
