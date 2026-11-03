/*
 * Input validation. Each function returns { errors: string[], value } where `value` is the
 * normalised input (trimmed strings, defaults applied). Controllers turn errors into a 400.
 */

const MAX_INT = 2147483647;
const SORTABLE_FIELDS = ['id', 'name', 'price', 'stock', 'createdAt', 'updatedAt'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasAtMostTwoDecimals(value) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

export function validateId(raw) {
  const errors = [];
  if (typeof raw !== 'string' || !/^\d{1,10}$/.test(raw) || Number(raw) < 1 || Number(raw) > MAX_INT) {
    errors.push('id must be a positive integer.');
    return { errors, value: null };
  }
  return { errors, value: Number(raw) };
}

/** Body for POST (create) and PUT (full replace): same rules for both. */
export function validateProductBody(body) {
  const errors = [];
  if (!isPlainObject(body)) {
    return { errors: ['Request body must be a JSON object (Content-Type: application/json).'], value: null };
  }

  const name = typeof body.name === 'string' ? body.name.trim() : body.name;
  if (name === undefined || name === null || name === '') {
    errors.push('name is required.');
  } else if (typeof name !== 'string') {
    errors.push('name must be a string.');
  } else if (name.length < 2 || name.length > 100) {
    errors.push('name must be between 2 and 100 characters.');
  }

  let description = body.description;
  if (description === undefined || description === null) {
    description = null;
  } else if (typeof description !== 'string') {
    errors.push('description must be a string or null.');
  } else {
    description = description.trim() === '' ? null : description.trim();
    if (description !== null && description.length > 1000) {
      errors.push('description must be at most 1000 characters.');
    }
  }

  const { price } = body;
  if (price === undefined || price === null) {
    errors.push('price is required.');
  } else if (typeof price !== 'number' || !Number.isFinite(price)) {
    errors.push('price must be a number.');
  } else if (price < 0.01 || price > 999999.99) {
    errors.push('price must be between 0.01 and 999999.99.');
  } else if (!hasAtMostTwoDecimals(price)) {
    errors.push('price must have at most 2 decimal places.');
  }

  const stock = body.stock === undefined || body.stock === null ? 0 : body.stock;
  if (typeof stock !== 'number' || !Number.isInteger(stock)) {
    errors.push('stock must be an integer.');
  } else if (stock < 0 || stock > 1000000) {
    errors.push('stock must be between 0 and 1000000.');
  }

  return { errors, value: { name, description, price, stock } };
}

/** ?page=&pageSize=&sortBy=&sortDir=&search= */
export function validateListQuery(query) {
  const errors = [];

  const page = parseOptionalInt(query.page, 1);
  if (page === null || page < 1 || page > 100000) errors.push('page must be an integer of at least 1.');

  const pageSize = parseOptionalInt(query.pageSize, 20);
  if (pageSize === null || pageSize < 1 || pageSize > 100) errors.push('pageSize must be an integer between 1 and 100.');

  const sortBy = typeof query.sortBy === 'string' && query.sortBy !== '' ? query.sortBy : 'createdAt';
  if (!SORTABLE_FIELDS.includes(sortBy)) errors.push(`sortBy must be one of: ${SORTABLE_FIELDS.join(', ')}.`);

  const sortDir = typeof query.sortDir === 'string' && query.sortDir !== '' ? query.sortDir.toLowerCase() : 'desc';
  if (sortDir !== 'asc' && sortDir !== 'desc') errors.push('sortDir must be asc or desc.');

  let search = null;
  if (query.search !== undefined) {
    if (typeof query.search !== 'string') {
      errors.push('search must be a single string.');
    } else {
      search = query.search.trim() || null;
      if (search !== null && search.length > 100) errors.push('search must be at most 100 characters.');
    }
  }

  return { errors, value: { page, pageSize, sortBy, sortDir, search } };
}

function parseOptionalInt(raw, defaultValue) {
  if (raw === undefined || raw === '') return defaultValue;
  if (typeof raw !== 'string' || !/^\d{1,9}$/.test(raw)) return null;
  return Number(raw);
}
