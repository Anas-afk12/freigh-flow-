// SQL for the rates child table (buying/selling, per-currency).
const db = require('../db/connection');
const { NotFoundError } = require('../utils/errors');

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
    .all(jobId);
}

function getById(id) {
  return db.prepare('SELECT * FROM rates WHERE id = ?').get(id);
}

function create(jobId, data) {
  // Only write provided columns so NOT NULL defaults (currency='USD',
  // paid_status='UNPAID') apply when omitted.
  const provided = COLS.filter((c) => data[c] !== undefined && data[c] !== null && data[c] !== '');
  const cols = ['job_id', ...provided];
  const values = [jobId, ...provided.map((c) => data[c])];
  const info = db
    .prepare(`INSERT INTO rates (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...values);
  return getById(info.lastInsertRowid);
}

function update(id, data) {
  if (!getById(id)) throw new NotFoundError(`Rate #${id} not found.`);
  const values = COLS.map((c) => (data[c] === undefined ? null : data[c]));
  db.prepare(`UPDATE rates SET ${COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...values, id);
  return getById(id);
}

function remove(id) {
  if (!getById(id)) throw new NotFoundError(`Rate #${id} not found.`);
  db.prepare('DELETE FROM rates WHERE id = ?').run(id);
}

// Rows needed for currency-aware profit aggregation.
function rawForProfit(jobId) {
  return db.prepare('SELECT rate_type, amount, currency FROM rates WHERE job_id = ?').all(jobId);
}

// Selling rows only — used by the invoice template.
function sellingByJob(jobId) {
  return db
    .prepare("SELECT * FROM rates WHERE job_id = ? AND rate_type = 'SELLING' ORDER BY id")
    .all(jobId);
}

module.exports = { listByJob, getById, create, update, remove, rawForProfit, sellingByJob };
