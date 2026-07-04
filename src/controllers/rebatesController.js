// A2 controller: rebates & commissions per job + mark-paid. Amounts arrive in
// display units; the repo stores cents.
const { ok, asyncHandler } = require('./respond');
const { parseId, requireEnum, requireNonNegativeNumber, optionalEnum } = require('../middleware/validate');
const { NotFoundError, ValidationError } = require('../utils/errors');
const rebatesRepo = require('../repositories/rebatesRepo');
const jobsRepo = require('../repositories/jobsRepo');
const clientsRepo = require('../repositories/clientsRepo');
const profitService = require('../services/profitService');

const TYPES = ['CLIENT_REBATE', 'LINE_REBATE', 'AGENT_COMMISSION'];

function validateBody(body) {
  requireEnum(body.type, TYPES, 'type');
  requireNonNegativeNumber(body.amount, 'amount');
  requireEnum(body.currency || 'USD', ['USD', 'PKR'], 'currency');
  optionalEnum(body.paid_status, ['UNPAID', 'PAID'], 'paid_status');
  if (body.party_id !== undefined && body.party_id !== null && body.party_id !== '') {
    if (!clientsRepo.getById(Number(body.party_id))) {
      throw new ValidationError(`Party #${body.party_id} does not exist.`);
    }
  }
}

const listByJob = asyncHandler(async (req, res) => {
  const jobId = parseId(req.params.id);
  if (!jobsRepo.getById(jobId)) throw new NotFoundError(`Job #${jobId} not found.`);
  ok(res, {
    rows: rebatesRepo.listByJob(jobId),
    profit: profitService.calculateAdjustedProfit(jobId, { persist: false }),
  });
});

const create = asyncHandler(async (req, res) => {
  const jobId = parseId(req.params.id);
  if (!jobsRepo.getById(jobId)) throw new NotFoundError(`Job #${jobId} not found.`);
  validateBody(req.body || {});
  ok(res, rebatesRepo.create(jobId, req.body), 201);
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  validateBody(req.body || {});
  ok(res, rebatesRepo.update(id, req.body));
});

const remove = asyncHandler(async (req, res) => {
  rebatesRepo.remove(parseId(req.params.id));
  ok(res, { deleted: true });
});

const markPaid = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  ok(res, rebatesRepo.markPaid(id, req.body || {}));
});

module.exports = { listByJob, create, update, remove, markPaid };
