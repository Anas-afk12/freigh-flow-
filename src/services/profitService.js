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

// A2 — adjusted profit including rebates & commissions, all converted to USD
// cents via the job's locked rate BEFORE entering the formula:
//   Adjusted Profit = Gross Profit − Client Rebates + Line Rebates − Agent Commissions
// With no rebate rows this returns exactly the gross profit — a job that
// never uses rebates behaves identically to before.
function calculateAdjustedProfit(jobId, { persist = false } = {}) {
  const profit = calculateProfit(jobId, { persist });
  const rebatesRepo = require('../repositories/rebatesRepo');
  const rows = rebatesRepo.rawForProfit(jobId);

  let clientRebates = 0;
  let lineRebates = 0;
  let agentCommissions = 0;
  for (const r of rows) {
    const usdCents = rowToUsdCents(r, profit.exchange_rate);
    if (r.type === 'CLIENT_REBATE') clientRebates += usdCents;
    else if (r.type === 'LINE_REBATE') lineRebates += usdCents;
    else if (r.type === 'AGENT_COMMISSION') agentCommissions += usdCents;
  }

  const adjustedUsdCents = profit._cents.profit_usd - clientRebates + lineRebates - agentCommissions;
  const adjustedPkrCents = usdCentsToPkrCents(adjustedUsdCents, profit.exchange_rate);
  return {
    ...profit,
    client_rebates: fromCents(clientRebates),
    line_rebates: fromCents(lineRebates),
    agent_commissions: fromCents(agentCommissions),
    adjusted_profit_usd: fromCents(adjustedUsdCents),
    adjusted_profit_pkr: fromCents(adjustedPkrCents),
    _cents: { ...profit._cents, adjusted_usd: adjustedUsdCents, adjusted_pkr: adjustedPkrCents },
  };
}

module.exports = { calculateProfit, calculateAdjustedProfit, ensureLockedRate };
