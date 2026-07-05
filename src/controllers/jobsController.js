// Jobs controller: list/search, detail, create (+containers), update, archive,
// child rates/containers, profit preview, tax generation. FK existence is
// validated before insert so clients get clean 400s, not raw SQLite errors.
const { ok, asyncHandler } = require('./respond');
const { parseId, requireEnum, optionalEnum, optionalNonNegativeNumber } = require('../middleware/validate');
const { ValidationError, NotFoundError } = require('../utils/errors');

const jobsRepo = require('../repositories/jobsRepo');
const ratesRepo = require('../repositories/ratesRepo');
const containersRepo = require('../repositories/containersRepo');
const clientsRepo = require('../repositories/clientsRepo');
const portsRepo = require('../repositories/portsRepo');
const commoditiesRepo = require('../repositories/commoditiesRepo');
const containerTypesRepo = require('../repositories/containerTypesRepo');
const { shippingLines } = require('../repositories/rateSheetRepo');
const jobNumberService = require('../services/jobNumberService');
const profitService = require('../services/profitService');
const taxService = require('../services/taxService');

const JOB_STATUSES = ['BOOKED', 'SAILED', 'DELIVERED', 'CLOSED', 'CANCELLED'];
const JOB_TYPES = ['FCL', 'LCL'];
const DIRECTIONS = ['EXPORT', 'IMPORT'];

// Validate that a referenced master-data id exists (when provided).
function assertRef(repo, id, label) {
  if (id === undefined || id === null || id === '') return;
  if (!repo.getById(Number(id))) throw new ValidationError(`${label} #${id} does not exist.`);
}

function validateJobBody(body) {
  optionalEnum(body.job_type, JOB_TYPES, 'job_type');
  optionalEnum(body.direction, DIRECTIONS, 'direction');
  optionalEnum(body.status, JOB_STATUSES, 'status');
  optionalNonNegativeNumber(body.packages, 'packages');
  optionalNonNegativeNumber(body.gross_weight, 'gross_weight');
  optionalNonNegativeNumber(body.net_weight, 'net_weight');
  assertRef(clientsRepo, body.shipper_id, 'Shipper');
  assertRef(clientsRepo, body.consignee_id, 'Consignee');
  assertRef(clientsRepo, body.notify_1_id, 'Notify party 1');
  assertRef(clientsRepo, body.notify_2_id, 'Notify party 2');
  assertRef(commoditiesRepo, body.commodity_id, 'Commodity');
  assertRef(portsRepo, body.pol_id, 'Port of loading');
  assertRef(portsRepo, body.pod_id, 'Port of discharge');
  assertRef(shippingLines, body.shipping_line_id, 'Shipping line');
}

// Derived BL tracking status (A1) — never stored, never printed.
function blStatusOf(job) {
  if (job.bl_forwarded_date) return 'FORWARDED';
  if (job.bl_received_date) return 'RECEIVED';
  return 'NOT_RECEIVED';
}

const list = asyncHandler(async (req, res) => {
  const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true';
  const data = jobsRepo.list({
    search: req.query.search || '',
    status: req.query.status || '',
    shippingLineId: req.query.shippingLineId ? Number(req.query.shippingLineId) : null,
    includeArchived,
    page: req.query.page,
    limit: req.query.limit,
  });
  data.rows = data.rows.map((r) => ({ ...r, bl_status: blStatusOf(r) }));
  ok(res, data);
});

const stats = asyncHandler(async (req, res) => ok(res, jobsRepo.stats()));

const nextNumber = asyncHandler(async (req, res) => ok(res, { job_number_preview: 'auto-generated on save' }));

const getOne = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const job = jobsRepo.getFull(id);
  if (!job) throw new NotFoundError(`Job #${id} not found.`);
  job.profit = profitService.calculateProfit(id, { persist: false });
  job.bl_status = blStatusOf(job);
  ok(res, job);
});

const create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  validateJobBody(body);
  const containers = Array.isArray(body.containers) ? body.containers : [];
  for (const c of containers) assertRef(containerTypesRepo, c.container_type_id, 'Container type');

  // Optional rate rows (auto-filled from the rate sheet, still user-edited).
  const rates = (Array.isArray(body.rates) ? body.rates : []).filter(
    (r) => r && r.charge_type && r.amount !== undefined && r.amount !== null && r.amount !== ''
  );
  for (const r of rates) {
    requireEnum(r.rate_type, ['BUYING', 'SELLING'], 'rate_type');
    requireEnum(r.currency || 'USD', ['USD', 'PKR'], 'currency');
    optionalNonNegativeNumber(r.amount, 'amount');
  }

  const jobNumber = jobNumberService.generate();
  const jobId = jobsRepo.create(jobNumber, body, containers, rates);
  ok(res, jobsRepo.getFull(jobId), 201);
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body || {};
  validateJobBody(body);
  jobsRepo.update(id, body);
  ok(res, jobsRepo.getFull(id));
});

// DELETE archives when the job is financially active; otherwise hard-deletes.
const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!jobsRepo.getById(id)) throw new NotFoundError(`Job #${id} not found.`);
  if (jobsRepo.isFinanciallyActive(id)) {
    ok(res, { archived: true, job: jobsRepo.setArchived(id, true) });
  } else {
    jobsRepo.remove(id);
    ok(res, { deleted: true });
  }
});

const archive = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const unarchive = req.body && (req.body.unarchive === true || req.body.unarchive === '1');
  ok(res, jobsRepo.setArchived(id, !unarchive));
});

// --- Containers ---
const listContainers = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  ok(res, containersRepo.listByJob(id));
});

const addContainer = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!jobsRepo.getById(id)) throw new NotFoundError(`Job #${id} not found.`);
  const body = req.body || {};
  optionalEnum(body.status, ['EMPTY', 'FULL', 'INTRANSIT', 'DELIVERED'], 'status');
  assertRef(containerTypesRepo, body.container_type_id, 'Container type');
  ok(res, containersRepo.create(id, body), 201);
});

// --- Rates ---
const listRates = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  ok(res, ratesRepo.listByJob(id));
});

const addRate = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!jobsRepo.getById(id)) throw new NotFoundError(`Job #${id} not found.`);
  const body = req.body || {};
  requireEnum(body.rate_type, ['BUYING', 'SELLING'], 'rate_type');
  requireEnum(body.currency || 'USD', ['USD', 'PKR'], 'currency');
  optionalEnum(body.paid_status, ['UNPAID', 'PAID'], 'paid_status');
  if (!body.charge_type || String(body.charge_type).trim() === '') {
    throw new ValidationError("Field 'charge_type' is required.");
  }
  optionalNonNegativeNumber(body.amount, 'amount');
  if (body.amount === undefined || body.amount === null || body.amount === '') {
    throw new ValidationError("Field 'amount' is required.");
  }
  assertRef(clientsRepo, body.vendor_id, 'Vendor');
  ok(res, ratesRepo.create(id, body), 201);
});

// --- BL tracking (A1) ---
const blReceived = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body || {};
  const date = body.date || new Date().toISOString().slice(0, 10);
  const job = jobsRepo.setBlReceived(id, { date, from: body.from });
  ok(res, { ...job, bl_status: blStatusOf(job) });
});

const blForwarded = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body || {};
  optionalEnum(body.method, ['EMAIL', 'COURIER', 'HAND'], 'method');
  optionalEnum(body.to, ['CLIENT', 'CONSIGNEE', 'BANK'], 'to');
  const date = body.date || new Date().toISOString().slice(0, 10);
  const job = jobsRepo.setBlForwarded(id, { date, method: body.method, to: body.to });
  ok(res, { ...job, bl_status: blStatusOf(job) });
});

// R1 — clone: duplicate as a new job (new number, blank dates/BL, BOOKED).
const cloneJob = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const newNumber = jobNumberService.generate();
  const newId = jobsRepo.clone(id, newNumber);
  ok(res, jobsRepo.getFull(newId), 201);
});

// --- LC details (A5) ---
const updateLc = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body || {};
  optionalEnum(body.lc_status, ['PENDING', 'ACTIVE', 'AMENDED', 'CLOSED', 'EXPIRED'], 'lc_status');
  optionalEnum(body.lc_currency, ['USD', 'PKR'], 'lc_currency');
  optionalNonNegativeNumber(body.lc_amount, 'lc_amount');
  jobsRepo.setLcDetails(id, body);
  ok(res, jobsRepo.getFull(id));
});

// --- Profit / Taxes ---
const profit = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!jobsRepo.getById(id)) throw new NotFoundError(`Job #${id} not found.`);
  ok(res, profitService.calculateProfit(id, { persist: false }));
});

const generateTaxes = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  ok(res, taxService.generateTaxes(id));
});

module.exports = {
  list, stats, nextNumber, getOne, create, update, remove, archive,
  listContainers, addContainer, listRates, addRate, profit, generateTaxes,
  blReceived, blForwarded, updateLc, cloneJob,
};
