// Generic controller factory for the four master-data resources. Parses the
// request, validates, calls the repo, shapes the response — no SQL here.
const { ok, asyncHandler } = require('./respond');
const { parseId, requireFields, optionalEnum } = require('../middleware/validate');

// config: { repo, requiredFields, enums: [{ field, values }], boolProp:'is_active' }
function createController({ repo, requiredFields = [], enums = [] }) {
  const list = asyncHandler(async (req, res) => {
    const activeOnly = req.query.active === '1' || req.query.active === 'true';
    ok(res, repo.list({ search: req.query.search || '', activeOnly }));
  });

  const getOne = asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const row = repo.getById(id);
    if (!row) return res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
    ok(res, row);
  });

  const create = asyncHandler(async (req, res) => {
    const body = req.body || {};
    requireFields(body, requiredFields);
    for (const e of enums) optionalEnum(body[e.field], e.values, e.field);
    ok(res, repo.create(body), 201);
  });

  const update = asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = req.body || {};
    requireFields(body, requiredFields);
    for (const e of enums) optionalEnum(body[e.field], e.values, e.field);
    ok(res, repo.update(id, body));
  });

  // "Delete" = soft toggle to inactive (never hard-deleted where referenced).
  const remove = asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    ok(res, repo.setActive(id, false));
  });

  const setActive = asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const active = req.body && (req.body.is_active === 1 || req.body.is_active === true || req.body.is_active === '1');
    ok(res, repo.setActive(id, active));
  });

  return { list, getOne, create, update, remove, setActive };
}

module.exports = { createController };
