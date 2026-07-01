// Currency-aware profit calculation (Business Rule #1, Improvement #1).
//
// Profit = Σ(SELLING rows -> USD) − Σ(BUYING rows -> USD), where every row is
// converted to USD *individually* using the job's LOCKED exchange rate before
// aggregation. Summing mixed USD/PKR amounts raw would add dollars to rupees.
//
// The exchange rate locks onto the job the first time profit/tax is generated
// (Improvement #2) so editing the global rate never rewrites history.
const jobsRepo = require('../repositories/jobsRepo');
const ratesRepo = require('../repositories/ratesRepo');
const settingsRepo = require('../repositories/settingsRepo');
const { toUsd, usdToPkr } = require('../utils/currency');
const { round2 } = require('../utils/numbers');
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

// Compute profit for a job. By default this locks the rate if unlocked; pass
// persist:false for a read-only preview (dashboard/report display).
function calculateProfit(jobId, { persist = true } = {}) {
  const rate = ensureLockedRate(jobId, { persist });
  const rows = ratesRepo.rawForProfit(jobId);

  let totalSelling = 0;
  let totalBuying = 0;
  for (const r of rows) {
    const usd = toUsd(r.amount, r.currency, rate);
    if (r.rate_type === 'SELLING') totalSelling += usd;
    else if (r.rate_type === 'BUYING') totalBuying += usd;
  }

  const profitUsd = totalSelling - totalBuying;
  return {
    exchange_rate: rate,
    total_selling: round2(totalSelling),
    total_buying: round2(totalBuying),
    profit_usd: round2(profitUsd),
    profit_pkr: round2(usdToPkr(profitUsd, rate)),
  };
}

module.exports = { calculateProfit, ensureLockedRate };
