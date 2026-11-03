import { performance } from 'node:perf_hooks';
import * as productRepository from '../repositories/product.repository.js';
import logger from '../utils/logger.js';
import { AppError, DataAccessError, ErrorCodes } from '../utils/AppError.js';

/*
 * Business rules for products. Input arrives already validated. Each function:
 *   try     - do the work
 *   catch   - map repository/unknown errors to client-safe AppErrors
 *   finally - log the duration
 */

function toAppError(err, operation) {
  if (err instanceof AppError) return err;
  if (err instanceof DataAccessError) {
    if (err.kind === 'UNIQUE_VIOLATION' && err.constraint === 'UQ_Products_Name') {
      return AppError.conflict(ErrorCodes.PRODUCT_NAME_TAKEN, 'A product with this name already exists.');
    }
    if (err.kind === 'FOREIGN_KEY_VIOLATION') {
      return AppError.conflict(ErrorCodes.PRODUCT_HAS_ORDERS, 'Product cannot be deleted because it has orders.');
    }
    return AppError.internal(); // already logged by the repository
  }
  logger.error('Unexpected error in product service', { operation, error: err?.message, stack: err?.stack });
  return AppError.internal();
}

function logTiming(operation, startedAt) {
  logger.debug('Service call finished', { service: 'product', operation, durationMs: Math.round(performance.now() - startedAt) });
}

export async function listProducts(query) {
  const startedAt = performance.now();
  try {
    const { total, items } = await productRepository.list(query);
    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  } catch (err) {
    throw toAppError(err, 'listProducts');
  } finally {
    logTiming('listProducts', startedAt);
  }
}

export async function getProduct(id) {
  const startedAt = performance.now();
  try {
    const product = await productRepository.findById(id);
    if (!product) throw AppError.notFound(ErrorCodes.PRODUCT_NOT_FOUND, `Product ${id} was not found.`);
    return product;
  } catch (err) {
    throw toAppError(err, 'getProduct');
  } finally {
    logTiming('getProduct', startedAt);
  }
}

export async function createProduct(input, user) {
  const startedAt = performance.now();
  try {
    const product = await productRepository.create(input);
    logger.info('Product created', { productId: product.id, userId: user.id });
    return product;
  } catch (err) {
    throw toAppError(err, 'createProduct');
  } finally {
    logTiming('createProduct', startedAt);
  }
}

export async function updateProduct(id, input, user) {
  const startedAt = performance.now();
  try {
    const product = await productRepository.update(id, input);
    if (!product) throw AppError.notFound(ErrorCodes.PRODUCT_NOT_FOUND, `Product ${id} was not found.`);
    logger.info('Product updated', { productId: id, userId: user.id });
    return product;
  } catch (err) {
    throw toAppError(err, 'updateProduct');
  } finally {
    logTiming('updateProduct', startedAt);
  }
}

export async function deleteProduct(id, user) {
  const startedAt = performance.now();
  try {
    const outcome = await productRepository.remove(id);
    if (outcome === 'NOT_FOUND') {
      throw AppError.notFound(ErrorCodes.PRODUCT_NOT_FOUND, `Product ${id} was not found.`);
    }
    if (outcome === 'HAS_ORDERS') {
      throw AppError.conflict(ErrorCodes.PRODUCT_HAS_ORDERS, 'Product cannot be deleted because it has orders.');
    }
    logger.info('Product deleted', { productId: id, userId: user.id });
    return { id };
  } catch (err) {
    throw toAppError(err, 'deleteProduct');
  } finally {
    logTiming('deleteProduct', startedAt);
  }
}
