// Reports controller: GPSHT + JOBGP as JSON and as Excel (SheetJS). Column
// order and headers mirror §12A exactly and are shared between JSON, the UI
// table, and the Excel export.
const XLSX = require('xlsx');
const { ok, asyncHandler } = require('./respond');
const reportsRepo = require('../repositories/reportsRepo');
const taxesRepo = require('../repositories/taxesRepo');
const profitService = require('../services/profitService');
const { round2 } = require('../utils/numbers');

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
  { key: 'pod', header: 'POD' },
];

const JOBGP_COLUMNS = [
  { key: 'job_number', header: 'Job Number' },
  { key: 'shipper', header: 'Shipper' },
  { key: 'freight_received', header: 'Freight Received (USD)' },
  { key: 'freight_paid', header: 'Freight Paid (USD)' },
  { key: 'profit_usd', header: 'Profit (USD)' },
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
    const profit = profitService.calculateProfit(job.id, { persist: false });
    const taxSums = taxesRepo.sumsByJob(job.id);
    const netGp = round2(profit.profit_pkr - taxSums.ZKT - taxSums.KHRT);
    return {
      job_number: job.job_number,
      shipper: job.shipper,
      freight_received: profit.total_selling,
      freight_paid: profit.total_buying,
      profit_usd: profit.profit_usd,
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

const gpsht = asyncHandler(async (req, res) => ok(res, { columns: GPSHT_COLUMNS, rows: buildGpsht(req.query) }));
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

module.exports = { gpsht, jobgp, gpshtExport, jobgpExport };
