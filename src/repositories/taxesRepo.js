// SQL for the taxes child table (ZKT/KHRT). base_amount and amount are STORED
// as integer PKR paisa (minor units); this repo converts to/from display units.
const db = require('../db/connection');
const { toCents, fromCents } = require('../utils/money');

function toDisplay(row) {
  if (!row) return row;
  return { ...row, base_amount: fromCents(row.base_amount), amount: fromCents(row.amount) };
}

function listByJob(jobId) {
  return db.prepare('SELECT * FROM taxes WHERE job_id = ? ORDER BY tax_type').all(jobId).map(toDisplay);
}

function deleteByJob(jobId) {
  db.prepare('DELETE FROM taxes WHERE job_id = ?').run(jobId);
}

// Accepts display units; stores minor units.
function insert(jobId, { tax_type, percentage, base_amount, amount }) {
  db.prepare(
    'INSERT INTO taxes (job_id, tax_type, percentage, base_amount, amount) VALUES (?,?,?,?,?)'
  ).run(jobId, tax_type, percentage, toCents(base_amount), toCents(amount));
}

// Sum of tax amounts by type for a job (display units, for the JOBGP report).
function sumsByJob(jobId) {
  const rows = db
    .prepare('SELECT tax_type, SUM(amount) AS total FROM taxes WHERE job_id = ? GROUP BY tax_type')
    .all(jobId);
  const out = { ZKT: 0, KHRT: 0 };
  for (const r of rows) out[r.tax_type] = fromCents(r.total) || 0;
  return out;
}

module.exports = { listByJob, deleteByJob, insert, sumsByJob };
