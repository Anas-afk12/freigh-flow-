// Currency-aware conversion helpers (Improvement #1: never sum mixed
// currencies raw). A job may hold both USD and PKR rate rows; each row must be
// converted to the common base (USD) individually using the job's LOCKED
// exchange rate before aggregation.

// Convert an amount from its currency into USD.
function toUsd(amount, currency, exchangeRate) {
  const value = Number(amount) || 0;
  if (currency === 'PKR') {
    if (!exchangeRate || exchangeRate <= 0) {
      throw new Error('A positive exchange rate is required to convert PKR to USD');
    }
    return value / exchangeRate;
  }
  return value; // already USD
}

// Convert a USD amount into PKR using the given rate.
function usdToPkr(amountUsd, exchangeRate) {
  return (Number(amountUsd) || 0) * (Number(exchangeRate) || 0);
}

module.exports = { toUsd, usdToPkr };
