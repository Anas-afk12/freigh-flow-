// SQL for rebates_commissions (A2). amount stored as integer cents; this repo
// converts to/from display units. Raw cents are exposed separately for the
// adjusted-profit math in profitService.
const db = require('../db/connection');
const { NotFoundError } = require('../utils/errors');
const { toCents, fromCents } = require('../utils/money');

const COLS = ['type', 'party_id', 'amount', 'currency', 'paid_status', 'paid_date', 'paid_ref', 'notes'];

function toDisplay(row) {
  if (!row) return row;
  return { ...row, amount: fromCents(row.amount) };
}

function listByJob(jobId) {
  return db
    .prepare(
      `SELECT rc.*, p.name AS party_name FROM rebates_commissions rc
       LEFT JOIN clients p ON rc.party_id = p.id
       WHERE rc.job_id = ? ORDER BY rc.type, rc.id`
    )
    .all(jobId)
    .map(toDisplay);
}

function getById(id) {
  return toDisplay(db.prepare('SELECT * FROM rebates_commissions WHERE id = ?').get(id));
}

function create(jobId, data) {
  const provided = COLS.filter((c) => data[c] !== undefined && data[c] !== null && data[c] !== '');
  const cols = ['job_id', ...provided];
  const values = [jobId, ...provided.map((c) => (c === 'amount' ? toCents(data[c]) : data[c]))];
  const info = db
    .prepare(`INSERT INTO rebates_commissions (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...values);
  return getById(info.lastInsertRowid);
}

function update(id, data) {
  if (!getById(id)) throw new NotFoundError(`Rebate/commission #${id} not found.`);
  const values = COLS.map((c) => {
    if (data[c] === undefined || data[c] === '') return null;
    return c === 'amount' ? toCents(data[c]) : data[c];
  });
  db.prepare(
    `UPDATE rebates_commissions SET ${COLS.map((c) => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(...values, id);
  return getById(id);
}

function remove(id) {
  if (!getById(id)) throw new NotFoundError(`Rebate/commission #${id} not found.`);
  db.prepare('DELETE FROM rebates_commissions WHERE id = ?').run(id);
}

function markPaid(id, { paid_date, paid_ref }) {
  if (!getById(id)) throw new NotFoundError(`Rebate/commission #${id} not found.`);
  db.prepare(
    "UPDATE rebates_commissions SET paid_status = 'PAID', paid_date = ?, paid_ref = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(paid_date || new Date().toISOString().slice(0, 10), paid_ref || null, id);
  return getById(id);
}

// Raw rows (amount in cents) for adjusted-profit aggregation.
function rawForProfit(jobId) {
  return db.prepare('SELECT type, amount, currency FROM rebates_commissions WHERE job_id = ?').all(jobId);
}

module.exports = { listByJob, getById, create, update, remove, markPaid, rawForProfit };
