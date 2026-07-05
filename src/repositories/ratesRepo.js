// SQL for the rates child table (buying/selling, per-currency).
// amount is STORED as integer minor units (cents/paisa); this repo converts
// to/from display units so the API and callers keep working in normal units.
const db = require('../db/connection');
const { NotFoundError } = require('../utils/errors');
const { toCents, fromCents } = require('../utils/money');

function toDisplay(row) {
  if (!row) return row;
  return { ...row, amount: fromCents(row.amount) };
}

const COLS = [
  'rate_type', 'charge_type', 'amount', 'currency', 'vendor_id',
  'invoice_number', 'paid_status', 'paid_date',
];

function listByJob(jobId) {
  return db
    .prepare(
      `SELECT r.*, v.name AS vendor_name FROM rates r
       LEFT JOIN clients v ON r.vendor_id = v.id
       WHERE r.job_id = ? ORDER BY r.rate_type, r.id`
    )
    .all(jobId)
    .map(toDisplay);
}

function getById(id) {
  return toDisplay(db.prepare('SELECT * FROM rates WHERE id = ?').get(id));
}

function create(jobId, data) {
  // Only write provided columns so NOT NULL defaults (currency='USD',
  // paid_status='UNPAID') apply when omitted.
  const provided = COLS.filter((c) => data[c] !== undefined && data[c] !== null && data[c] !== '');
  const cols = ['job_id', ...provided];
  const values = [jobId, ...provided.map((c) => (c === 'amount' ? toCents(data[c]) : data[c]))];
  const info = db
    .prepare(`INSERT INTO rates (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...values);
  return getById(info.lastInsertRowid);
}

function update(id, data) {
  if (!getById(id)) throw new NotFoundError(`Rate #${id} not found.`);
  const values = COLS.map((c) => {
    if (data[c] === undefined) return null;
    return c === 'amount' ? toCents(data[c]) : data[c];
  });
  db.prepare(`UPDATE rates SET ${COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...values, id);
  return getById(id);
}

function remove(id) {
  if (!getById(id)) throw new NotFoundError(`Rate #${id} not found.`);
  db.prepare('DELETE FROM rates WHERE id = ?').run(id);
}

// Rows for currency-aware profit aggregation. amount is returned in RAW
// integer minor units (cents/paisa) — profitService does integer math on it.
function rawForProfit(jobId) {
  return db.prepare('SELECT rate_type, amount, currency FROM rates WHERE job_id = ?').all(jobId);
}

// Selling rows only — used by the invoice template (display units).
function sellingByJob(jobId) {
  return db
    .prepare("SELECT * FROM rates WHERE job_id = ? AND rate_type = 'SELLING' ORDER BY id")
    .all(jobId)
    .map(toDisplay);
}

module.exports = { listByJob, getById, create, update, remove, rawForProfit, sellingByJob };
