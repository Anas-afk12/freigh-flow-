// Server-side validation helpers. Throw ValidationError (400) on failure.
// Client-side validate.js mirrors these rules for instant feedback, but the
// server is always the source of truth.
const { ValidationError } = require('../utils/errors');

function requireFields(obj, fields) {
  for (const f of fields) {
    const v = obj[f];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      throw new ValidationError(`Field '${f}' is required.`);
    }
  }
}

function requireEnum(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`Field '${fieldName}' must be one of: ${allowed.join(', ')}.`);
  }
}

function optionalEnum(value, allowed, fieldName) {
  if (value === undefined || value === null || value === '') return;
  requireEnum(value, allowed, fieldName);
}

// Non-negative number (amounts, weights, packages).
function requireNonNegativeNumber(value, fieldName) {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) {
    throw new ValidationError(`Field '${fieldName}' must be a number >= 0.`);
  }
  return n;
}

function optionalNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  return requireNonNegativeNumber(value, fieldName);
}

function parseId(value, fieldName = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError(`Invalid ${fieldName}.`);
  }
  return n;
}

module.exports = {
  requireFields,
  requireEnum,
  optionalEnum,
  requireNonNegativeNumber,
  optionalNonNegativeNumber,
  parseId,
};
