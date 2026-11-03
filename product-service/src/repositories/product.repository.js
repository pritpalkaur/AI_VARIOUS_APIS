import { performance } from 'node:perf_hooks';
import { getPool, sql } from '../db/pool.js';
import logger from '../utils/logger.js';
import { DataAccessError } from '../utils/AppError.js';

/*
 * Data access for dbo.Products. Rules followed by every function:
 *  - parameterized SQL only, written as complete literal statements (no string building,
 *    not even for ORDER BY - see list()),
 *  - try/catch/finally: driver errors are logged and rethrown as DataAccessError,
 *  - connections always go back to the pool (see db/pool.js for how mssql releases them).
 */

const SQL_UNIQUE_CONSTRAINT = 2627;
const SQL_UNIQUE_INDEX = 2601;
const SQL_FOREIGN_KEY = 547;

function toDataAccessError(err, operation) {
  const constraint = /'((?:UQ|FK|IX)_[A-Za-z0-9_]+)'/.exec(err?.message ?? '')?.[1] ?? null;

  if (err?.number === SQL_UNIQUE_CONSTRAINT || err?.number === SQL_UNIQUE_INDEX) {
    logger.info('Unique constraint violated', { repository: 'product', operation, constraint });
    return new DataAccessError(operation, 'Unique constraint violated.', { cause: err, kind: 'UNIQUE_VIOLATION', constraint });
  }
  if (err?.number === SQL_FOREIGN_KEY) {
    logger.info('Foreign key constraint violated', { repository: 'product', operation, constraint });
    return new DataAccessError(operation, 'Foreign key violated.', { cause: err, kind: 'FOREIGN_KEY_VIOLATION', constraint });
  }

  logger.error('Database error', {
    repository: 'product',
    operation,
    error: err?.message,
    code: err?.code,
    number: err?.number,
    stack: err?.stack,
  });
  return new DataAccessError(operation, 'Database operation failed.', { cause: err });
}

function logTiming(operation, startedAt) {
  logger.debug('Repository call finished', {
    repository: 'product',
    operation,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

/**
 * Paged list with optional name search and whitelisted sorting.
 * ORDER BY cannot take a parameter, so instead of splicing a column name into the SQL,
 * each allowed sort is a CASE branch selected by the @SortBy/@SortDir parameters.
 */
export async function list({ page, pageSize, sortBy, sortDir, search }) {
  const startedAt = performance.now();
  try {
    const request = getPool().request();
    request.input('Offset', sql.Int, (page - 1) * pageSize);
    request.input('PageSize', sql.Int, pageSize);
    request.input('SortBy', sql.NVarChar(20), sortBy);
    request.input('SortDir', sql.NVarChar(4), sortDir);
    request.input('SearchPattern', sql.NVarChar(310), search ? `%${escapeLike(search)}%` : null);

    const result = await request.query(`
      SELECT COUNT(*) AS total
      FROM dbo.Products
      WHERE (@SearchPattern IS NULL OR Name LIKE @SearchPattern ESCAPE '\\');

      SELECT Id AS id, Name AS name, Description AS description, Price AS price,
             Stock AS stock, CreatedAt AS createdAt, UpdatedAt AS updatedAt
      FROM dbo.Products
      WHERE (@SearchPattern IS NULL OR Name LIKE @SearchPattern ESCAPE '\\')
      ORDER BY
        CASE WHEN @SortBy = 'id'        AND @SortDir = 'asc'  THEN Id        END ASC,
        CASE WHEN @SortBy = 'id'        AND @SortDir = 'desc' THEN Id        END DESC,
        CASE WHEN @SortBy = 'name'      AND @SortDir = 'asc'  THEN Name      END ASC,
        CASE WHEN @SortBy = 'name'      AND @SortDir = 'desc' THEN Name      END DESC,
        CASE WHEN @SortBy = 'price'     AND @SortDir = 'asc'  THEN Price     END ASC,
        CASE WHEN @SortBy = 'price'     AND @SortDir = 'desc' THEN Price     END DESC,
        CASE WHEN @SortBy = 'stock'     AND @SortDir = 'asc'  THEN Stock     END ASC,
        CASE WHEN @SortBy = 'stock'     AND @SortDir = 'desc' THEN Stock     END DESC,
        CASE WHEN @SortBy = 'createdAt' AND @SortDir = 'asc'  THEN CreatedAt END ASC,
        CASE WHEN @SortBy = 'createdAt' AND @SortDir = 'desc' THEN CreatedAt END DESC,
        CASE WHEN @SortBy = 'updatedAt' AND @SortDir = 'asc'  THEN UpdatedAt END ASC,
        CASE WHEN @SortBy = 'updatedAt' AND @SortDir = 'desc' THEN UpdatedAt END DESC,
        Id ASC
      OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
    `);

    return { total: result.recordsets[0][0].total, items: result.recordsets[1] };
  } catch (err) {
    throw toDataAccessError(err, 'list');
  } finally {
    // The query has settled, so mssql has already returned its connection to the pool.
    logTiming('list', startedAt);
  }
}

export async function findById(id) {
  const startedAt = performance.now();
  try {
    const request = getPool().request();
    request.input('Id', sql.Int, id);
    const result = await request.query(`
      SELECT Id AS id, Name AS name, Description AS description, Price AS price,
             Stock AS stock, CreatedAt AS createdAt, UpdatedAt AS updatedAt
      FROM dbo.Products
      WHERE Id = @Id;
    `);
    return result.recordset[0] ?? null;
  } catch (err) {
    throw toDataAccessError(err, 'findById');
  } finally {
    logTiming('findById', startedAt);
  }
}

export async function create({ name, description, price, stock }) {
  const startedAt = performance.now();
  try {
    const request = getPool().request();
    request.input('Name', sql.NVarChar(100), name);
    request.input('Description', sql.NVarChar(1000), description);
    request.input('Price', sql.Decimal(10, 2), price);
    request.input('Stock', sql.Int, stock);

    const result = await request.query(`
      INSERT INTO dbo.Products (Name, Description, Price, Stock)
      OUTPUT INSERTED.Id AS id, INSERTED.Name AS name, INSERTED.Description AS description,
             INSERTED.Price AS price, INSERTED.Stock AS stock,
             INSERTED.CreatedAt AS createdAt, INSERTED.UpdatedAt AS updatedAt
      VALUES (@Name, @Description, @Price, @Stock);
    `);
    return result.recordset[0];
  } catch (err) {
    throw toDataAccessError(err, 'create');
  } finally {
    logTiming('create', startedAt);
  }
}

/** Returns the updated product, or null when no product has that id. */
export async function update(id, { name, description, price, stock }) {
  const startedAt = performance.now();
  try {
    const request = getPool().request();
    request.input('Id', sql.Int, id);
    request.input('Name', sql.NVarChar(100), name);
    request.input('Description', sql.NVarChar(1000), description);
    request.input('Price', sql.Decimal(10, 2), price);
    request.input('Stock', sql.Int, stock);

    const result = await request.query(`
      UPDATE dbo.Products
      SET Name = @Name, Description = @Description, Price = @Price, Stock = @Stock,
          UpdatedAt = SYSUTCDATETIME()
      OUTPUT INSERTED.Id AS id, INSERTED.Name AS name, INSERTED.Description AS description,
             INSERTED.Price AS price, INSERTED.Stock AS stock,
             INSERTED.CreatedAt AS createdAt, INSERTED.UpdatedAt AS updatedAt
      WHERE Id = @Id;
    `);
    return result.recordset[0] ?? null;
  } catch (err) {
    throw toDataAccessError(err, 'update');
  } finally {
    logTiming('update', startedAt);
  }
}

/**
 * Deletes a product. Returns true when a row was deleted, false when no product has that id.
 * Orders live in the Order Service's database, so the "has orders?" check happens in the
 * service layer through the Order API, before this is called.
 */
export async function remove(id) {
  const startedAt = performance.now();
  try {
    const request = getPool().request();
    request.input('Id', sql.Int, id);
    const result = await request.query('DELETE FROM dbo.Products WHERE Id = @Id;');
    return result.rowsAffected[0] > 0;
  } catch (err) {
    throw toDataAccessError(err, 'remove');
  } finally {
    logTiming('remove', startedAt);
  }
}

/** Escapes LIKE wildcards so a search for "50%" matches the literal text. */
function escapeLike(value) {
  return value.replace(/[\\%_[]/g, (ch) => `\\${ch}`);
}
