// Currency-aware profit calculation (Business Rule #1, Improvement #1, B1).
//
// Profit = Σ(SELLING rows -> USD) − Σ(BUYING rows -> USD), where every row is
// converted to USD *individually* using the job's LOCKED exchange rate before
// aggregation. Summing mixed USD/PKR amounts raw would add dollars to rupees.
//
// B1 hardening: all arithmetic happens on INTEGER minor units (cents/paisa) —
// rounding occurs exactly once per currency conversion, so no float drift can
// accumulate across rows. Display units are produced only at the return edge.
//
// The exchange rate locks onto the job the first time profit/tax is generated
// (Improvement #2) so editing the global rate never rewrites history.
const jobsRepo = require('../repositories/jobsRepo');
const ratesRepo = require('../repositories/ratesRepo');
const settingsRepo = require('../repositories/settingsRepo');
const { fromCents, pkrCentsToUsdCents, usdCentsToPkrCents } = require('../utils/money');
const { NotFoundError } = require('../utils/errors');

// Return the rate locked on the job, locking the current global rate if none
// is set yet. Set persist=false to preview without mutating the job.
function ensureLockedRate(jobId, { persist = true } = {}) {
  const job = jobsRepo.getById(jobId);
  if (!job) throw new NotFoundError(`Job #${jobId} not found.`);
  if (job.exchange_rate_locked != null) return job.exchange_rate_locked;
  const globalRate = settingsRepo.getNumber('exchange_rate', 280);
  if (persist) jobsRepo.lockExchangeRate(jobId, globalRate);
  return globalRate;
}

// Convert one rate row's stored minor units into USD cents.
function rowToUsdCents(row, rate) {
  const cents = Number(row.amount) || 0; // stored minor units
  return row.currency === 'PKR' ? pkrCentsToUsdCents(cents, rate) : cents;
}

// Compute profit for a job. By default this locks the rate if unlocked; pass
// persist:false for a read-only preview (dashboard/report display).
function calculateProfit(jobId, { persist = true } = {}) {
  const rate = ensureLockedRate(jobId, { persist });
  const rows = ratesRepo.rawForProfit(jobId);

  let sellingCents = 0;
  let buyingCents = 0;
  for (const r of rows) {
    const usdCents = rowToUsdCents(r, rate);
    if (r.rate_type === 'SELLING') sellingCents += usdCents;
    else if (r.rate_type === 'BUYING') buyingCents += usdCents;
  }

  const profitUsdCents = sellingCents - buyingCents;
  const profitPkrCents = usdCentsToPkrCents(profitUsdCents, rate);
  return {
    exchange_rate: rate,
    total_selling: fromCents(sellingCents),
    total_buying: fromCents(buyingCents),
    profit_usd: fromCents(profitUsdCents),
    profit_pkr: fromCents(profitPkrCents),
    // Raw minor units for downstream integer math (tax generation).
    _cents: { selling: sellingCents, buying: buyingCents, profit_usd: profitUsdCents, profit_pkr: profitPkrCents },
  };
}

module.exports = { calculateProfit, ensureLockedRate };
