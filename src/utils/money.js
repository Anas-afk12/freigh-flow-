// Money-as-integers (hardening B1). Every monetary amount is STORED as an
// integer in minor units (cents for USD, paisa for PKR) so no float drift can
// ever appear in financial records. Conversion to display units happens only
// at the repository boundary (API/UI still speak normal units).
//
// Non-monetary decimals (weights, CBM, percentages, exchange rates) are NOT
// stored in minor units — only actual money is.

// Display units -> integer minor units. Accepts '1500', 1500, 1500.5.
function toCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) throw new Error(`Not a valid monetary amount: ${value}`);
  return Math.round(n * 100);
}

// Integer minor units -> display units.
function fromCents(cents) {
  if (cents === null || cents === undefined) return null;
  return cents / 100;
}

// Convert an amount in minor units between currencies using an exchange rate
// (PKR per USD). Integer in, integer out — rounding happens exactly once here.
function pkrCentsToUsdCents(pkrCents, exchangeRate) {
  if (!exchangeRate || exchangeRate <= 0) {
    throw new Error('A positive exchange rate is required to convert PKR to USD');
  }
  return Math.round(pkrCents / exchangeRate);
}

function usdCentsToPkrCents(usdCents, exchangeRate) {
  return Math.round(usdCents * exchangeRate);
}

module.exports = { toCents, fromCents, pkrCentsToUsdCents, usdCentsToPkrCents };
