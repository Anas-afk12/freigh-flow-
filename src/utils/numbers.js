// Numeric formatting/rounding helpers.

// Round to 2 decimal places, avoiding float dust (e.g. 1.005 -> 1.01).
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Format a number with thousands separators and fixed 2 decimals.
function money(n) {
  return round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Zero-pad a sequence number to 3 digits (001, 042, 999, 1000...).
function pad3(seq) {
  return String(seq).padStart(3, '0');
}

module.exports = { round2, money, pad3 };
