// Shared JSON envelope used by all three services:
//   { "success": true,  "data": ..., "message": "..." }
//   { "success": false, "error": { "code": "...", "message": "..." } }

export function sendSuccess(res, statusCode, data, message) {
  return res.status(statusCode).json({ success: true, data, message });
}

export function sendError(res, statusCode, code, message) {
  return res.status(statusCode).json({ success: false, error: { code, message } });
}
