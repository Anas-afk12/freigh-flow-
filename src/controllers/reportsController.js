// Reports controller: GPSHT + JOBGP as JSON and as Excel (SheetJS). Column
// order and headers mirror §12A exactly and are shared between JSON, the UI
// table, and the Excel export.
const XLSX = require('xlsx');
const { ok, asyncHandler } = require('./respond');
const reportsRepo = require('../repositories/reportsRepo');
const taxesRepo = require('../repositories/taxesRepo');
const profitService = require('../services/profitService');
const { round2 } = require('../utils/numbers');
const { fromCents } = require('../utils/money');

const PAYABLES_COLUMNS = [
  { key: 'vendor', header: 'Vendor' },
  { key: 'job_number', header: 'Job Number' },
  { key: 'charge_type', header: 'Charge' },
  { key: 'amount', header: 'Amount' },
  { key: 'currency', header: 'Currency' },
  { key: 'invoice_number', header: 'Invoice #' },
  { key: 'incurred_date', header: 'Incurred' },
  { key: 'days_outstanding', header: 'Days Outstanding' },
];

const GPSHT_COLUMNS = [
  { key: 'job_number', header: 'Job Number' },
  { key: 'shipper', header: 'Shipper' },
  { key: 'container_number', header: 'Container Number' },
  { key: 'vessel', header: 'Vessel' },
  { key: 'voyage', header: 'Voyage' },
  { key: 'etd', header: 'ETD' },
  { key: 'eta', header: 'ETA' },
  { key: 'status', header: 'Status' },
  { key: 'bl_number', header: 'BL Number' },
  { key: 'bl_status', header: 'BL Status' },
  { key: 'pod', header: 'POD' },
];

const JOBGP_COLUMNS = [
  { key: 'job_number', header: 'Job Number' },
  { key: 'shipper', header: 'Shipper' },
  { key: 'freight_received', header: 'Freight Received (USD)' },
  { key: 'freight_paid', header: 'Freight Paid (USD)' },
  { key: 'profit_usd', header: 'Profit (USD)' },
  { key: 'client_rebates', header: 'Client Rebates (USD)' },
  { key: 'line_rebates', header: 'Line Rebates (USD)' },
  { key: 'agent_commissions', header: 'Agent Comm. (USD)' },
  { key: 'adjusted_profit_usd', header: 'Adjusted Profit (USD)' },
  { key: 'profit_pkr', header: 'Profit (PKR)' },
  { key: 'zkt', header: 'ZKT' },
  { key: 'khrt', header: 'KHRT' },
  { key: 'net_gp', header: 'Net GP' },
  { key: 'status', header: 'Status' },
];

function filtersFromQuery(q) {
  return {
    status: q.status || '',
    podId: q.podId ? Number(q.podId) : null,
    etdFrom: q.etdFrom || '',
    etdTo: q.etdTo || '',
    dateFrom: q.dateFrom || '',
    dateTo: q.dateTo || '',
    includeArchived: q.includeArchived === '1' || q.includeArchived === 'true',
  };
}

function buildGpsht(q) {
  return reportsRepo.gpsht(filtersFromQuery(q));
}

// JOBGP: base job list + currency-aware profit (read-only preview) + tax sums.
function buildJobgp(q) {
  const base = reportsRepo.jobgpBase(filtersFromQuery(q));
  return base.map((job) => {
    // Adjusted profit (A2): Gross − client rebates + line rebates − agent
    // commissions. Net GP = Adjusted (PKR) − ZKT − KHRT. With no rebate rows
    // this is byte-identical to the pre-A2 report.
    const profit = profitService.calculateAdjustedProfit(job.id, { persist: false });
    const taxSums = taxesRepo.sumsByJob(job.id);
    const netGp = round2(profit.adjusted_profit_pkr - taxSums.ZKT - taxSums.KHRT);
    return {
      job_number: job.job_number,
      shipper: job.shipper,
      freight_received: profit.total_selling,
      freight_paid: profit.total_buying,
      profit_usd: profit.profit_usd,
      client_rebates: profit.client_rebates,
      line_rebates: profit.line_rebates,
      agent_commissions: profit.agent_commissions,
      adjusted_profit_usd: profit.adjusted_profit_usd,
      profit_pkr: profit.profit_pkr,
      zkt: round2(taxSums.ZKT),
      khrt: round2(taxSums.KHRT),
      net_gp: netGp,
      status: job.status,
    };
  });
}

function toWorkbookBuffer(rows, columns, sheetName) {
  const aoa = [columns.map((c) => c.header)];
  for (const row of rows) aoa.push(columns.map((c) => row[c.key] ?? ''));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildPayables() {
  return reportsRepo.payablesAging().map((r) => ({ ...r, amount: fromCents(r.amount) }));
}

const gpsht = asyncHandler(async (req, res) => ok(res, { columns: GPSHT_COLUMNS, rows: buildGpsht(req.query) }));
const payablesAging = asyncHandler(async (req, res) => ok(res, { columns: PAYABLES_COLUMNS, rows: buildPayables() }));
const payablesExport = asyncHandler(async (req, res) => {
  sendXlsx(res, toWorkbookBuffer(buildPayables(), PAYABLES_COLUMNS, 'Payables Aging'), 'payables-aging.xlsx');
});
const jobgp = asyncHandler(async (req, res) => ok(res, { columns: JOBGP_COLUMNS, rows: buildJobgp(req.query) }));

const gpshtExport = asyncHandler(async (req, res) => {
  const buf = toWorkbookBuffer(buildGpsht(req.query), GPSHT_COLUMNS, 'GPSHT');
  sendXlsx(res, buf, 'GPSHT-report.xlsx');
});

const jobgpExport = asyncHandler(async (req, res) => {
  const buf = toWorkbookBuffer(buildJobgp(req.query), JOBGP_COLUMNS, 'JOBGP');
  sendXlsx(res, buf, 'JOBGP-report.xlsx');
});

function sendXlsx(res, buf, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}

module.exports = { gpsht, jobgp, gpshtExport, jobgpExport, payablesAging, payablesExport };
