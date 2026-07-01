// ZKT / KHRT tax generation (Business Rule #3, Improvements #2 & #11).
//
// Taxes generate only on POSITIVE PKR profit. Percentages are pulled from
// settings at generation time (never hardcoded). Generating locks the job's
// exchange rate (via profitService) and replaces any prior tax rows for the job
// atomically. Regenerating is an explicit user action.
const db = require('../db/connection');
const jobsRepo = require('../repositories/jobsRepo');
const taxesRepo = require('../repositories/taxesRepo');
const settingsRepo = require('../repositories/settingsRepo');
const profitService = require('./profitService');
const { round2 } = require('../utils/numbers');
const { NotFoundError } = require('../utils/errors');

function generateTaxes(jobId) {
  if (!jobsRepo.getById(jobId)) throw new NotFoundError(`Job #${jobId} not found.`);

  // Locking happens here (persist:true) — this is the first-generation trigger.
  const profit = profitService.calculateProfit(jobId, { persist: true });
  const zktPct = settingsRepo.getNumber('zkt_percentage', 2.5);
  const khrtPct = settingsRepo.getNumber('khrt_percentage', 7.5);

  const positivePkr = profit.profit_pkr > 0 ? profit.profit_pkr : 0;
  const zktAmount = round2((positivePkr * zktPct) / 100);
  const khrtAmount = round2((positivePkr * khrtPct) / 100);

  const tx = db.transaction(() => {
    taxesRepo.deleteByJob(jobId);
    taxesRepo.insert(jobId, { tax_type: 'ZKT', percentage: zktPct, base_amount: positivePkr, amount: zktAmount });
    taxesRepo.insert(jobId, { tax_type: 'KHRT', percentage: khrtPct, base_amount: positivePkr, amount: khrtAmount });
  });
  tx();

  return {
    profit,
    taxes: taxesRepo.listByJob(jobId),
    zkt: zktAmount,
    khrt: khrtAmount,
    total_tax: round2(zktAmount + khrtAmount),
    net_gp_pkr: round2(profit.profit_pkr - zktAmount - khrtAmount),
  };
}

module.exports = { generateTaxes };
