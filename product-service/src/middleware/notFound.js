import { ErrorCodes } from '../utils/AppError.js';
import { sendError } from '../utils/apiResponse.js';

export function notFound(req, res) {
  sendError(res, 404, ErrorCodes.NOT_FOUND, 'The requested resource was not found.');
}
