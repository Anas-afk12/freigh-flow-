// Centralized error handler. Typed AppErrors map to their status/code; any
// other error becomes a clean 500 without leaking stack traces to the client.
const { AppError } = require('../utils/errors');

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { message: `Route not found: ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' },
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { message: err.message, code: err.code },
    });
  }

  // Translate raw SQLite constraint failures into clean 409s where possible.
  const msg = String(err && err.message);
  if (/UNIQUE constraint failed/i.test(msg)) {
    return res.status(409).json({
      success: false,
      error: { message: 'A record with these unique values already exists.', code: 'CONFLICT' },
    });
  }
  if (/FOREIGN KEY constraint failed/i.test(msg)) {
    return res.status(400).json({
      success: false,
      error: { message: 'Referenced record does not exist.', code: 'VALIDATION_ERROR' },
    });
  }

  console.error('[unhandled error]', err);
  res.status(500).json({
    success: false,
    error: { message: 'An unexpected server error occurred.', code: 'INTERNAL_ERROR' },
  });
}

module.exports = { errorHandler, notFoundHandler };
