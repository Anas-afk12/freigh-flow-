// Settings controller. GET returns the full key/value map; PUT upserts the
// editable keys. Tax %, exchange rate and job prefix all live here so they are
// never hardcoded in application logic (Improvements #2 & #11).
const { ok, asyncHandler } = require('./respond');
const { ValidationError } = require('../utils/errors');
const settingsRepo = require('../repositories/settingsRepo');

const EDITABLE_KEYS = [
  'job_prefix', 'exchange_rate', 'zkt_percentage', 'khrt_percentage',
  'company_name', 'company_address', 'company_phone', 'company_email', 'bank_details',
];
const NUMERIC_KEYS = ['exchange_rate', 'zkt_percentage', 'khrt_percentage'];

const get = asyncHandler(async (req, res) => ok(res, settingsRepo.getMap()));

const update = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const updates = {};
  for (const key of EDITABLE_KEYS) {
    if (body[key] === undefined) continue;
    if (NUMERIC_KEYS.includes(key)) {
      const n = Number(body[key]);
      if (Number.isNaN(n) || n < 0) throw new ValidationError(`Setting '${key}' must be a number >= 0.`);
      updates[key] = String(n);
    } else {
      updates[key] = String(body[key]);
    }
  }
  settingsRepo.setMany(updates);
  ok(res, settingsRepo.getMap());
});

module.exports = { get, update };
