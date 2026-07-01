// Typed application errors. The centralized error handler maps these to
// HTTP status codes and a { success:false, error:{ message, code } } envelope.
class AppError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 'CONFLICT', 409);
  }
}

module.exports = { AppError, ValidationError, NotFoundError, ConflictError };
