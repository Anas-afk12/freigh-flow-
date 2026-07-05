// A3 controller: master rates CRUD, local charges list/upsert, shipping lines
// CRUD, and the auto-fill match lookup used by the new-job form.
const { ok, asyncHandler } = require('./respond');
const { parseId, requireFields } = require('../middleware/validate');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { masterRates, localCharges, shippingLines } = require('../repositories/rateSheetRepo');
const portsRepo = require('../repositories/portsRepo');
const containerTypesRepo = require('../repositories/containerTypesRepo');

function assertRefs(body) {
  if (!portsRepo.getById(Number(body.destination_port_id))) {
    throw new ValidationError(`Port #${body.destination_port_id} does not exist.`);
  }
  if (!containerTypesRepo.getById(Number(body.container_type_id))) {
    throw new ValidationError(`Container type #${body.container_type_id} does not exist.`);
  }
}

// ---- master rates ----
const listMaster = asyncHandler(async (req, res) => ok(res, masterRates.list()));

// GET /api/rates/master/match?pod_id=&container_type_id= — auto-fill lookup.
// Silently returns null when there is no match (auto-fill then does nothing).
const matchMaster = asyncHandler(async (req, res) => {
  const podId = Number(req.query.pod_id);
  const ctId = Number(req.query.container_type_id);
  if (!podId || !ctId) return ok(res, null);
  ok(res, masterRates.match(podId, ctId) || null);
});

const createMaster = asyncHandler(async (req, res) => {
  const body = req.body || {};
  requireFields(body, ['destination_port_id', 'container_type_id']);
  assertRefs(body);
  ok(res, masterRates.create(body), 201);
});

const updateMaster = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body || {};
  requireFields(body, ['destination_port_id', 'container_type_id']);
  assertRefs(body);
  ok(res, masterRates.update(id, body));
});

const removeMaster = asyncHandler(async (req, res) => {
  masterRates.remove(parseId(req.params.id));
  ok(res, { deleted: true });
});

// ---- local charges ----
const listLocal = asyncHandler(async (req, res) => ok(res, localCharges.list()));

const upsertLocal = asyncHandler(async (req, res) => {
  const chargeType = String(req.params.chargeType || '').toUpperCase();
  if (!chargeType) throw new ValidationError('charge_type is required.');
  ok(res, localCharges.upsert(chargeType, req.body || {}));
});

// ---- shipping lines ----
const listLines = asyncHandler(async (req, res) => {
  const activeOnly = req.query.active === '1' || req.query.active === 'true';
  ok(res, shippingLines.list({ activeOnly }));
});

const getLine = asyncHandler(async (req, res) => {
  const row = shippingLines.getById(parseId(req.params.id));
  if (!row) throw new NotFoundError('Shipping line not found.');
  ok(res, row);
});

const createLine = asyncHandler(async (req, res) => {
  requireFields(req.body || {}, ['code']);
  ok(res, shippingLines.create(req.body), 201);
});

const updateLine = asyncHandler(async (req, res) => {
  requireFields(req.body || {}, ['code']);
  ok(res, shippingLines.update(parseId(req.params.id), req.body));
});

const removeLine = asyncHandler(async (req, res) => {
  ok(res, shippingLines.setActive(parseId(req.params.id), false));
});

const setLineActive = asyncHandler(async (req, res) => {
  const active = req.body && (req.body.is_active === 1 || req.body.is_active === true || req.body.is_active === '1');
  ok(res, shippingLines.setActive(parseId(req.params.id), active));
});

module.exports = {
  listMaster, matchMaster, createMaster, updateMaster, removeMaster,
  listLocal, upsertLocal,
  listLines, getLine, createLine, updateLine, removeLine, setLineActive,
};
