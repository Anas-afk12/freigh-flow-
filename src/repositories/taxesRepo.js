// SQL for the taxes child table (ZKT/KHRT).
const db = require('../db/connection');

function listByJob(jobId) {
  return db.prepare('SELECT * FROM taxes WHERE job_id = ? ORDER BY tax_type').all(jobId);
}

function deleteByJob(jobId) {
  db.prepare('DELETE FROM taxes WHERE job_id = ?').run(jobId);
}

function insert(jobId, { tax_type, percentage, base_amount, amount }) {
  db.prepare(
    'INSERT INTO taxes (job_id, tax_type, percentage, base_amount, amount) VALUES (?,?,?,?,?)'
  ).run(jobId, tax_type, percentage, base_amount, amount);
}

// Sum of tax amounts by type for a job (for the JOBGP report).
function sumsByJob(jobId) {
  const rows = db
    .prepare('SELECT tax_type, SUM(amount) AS total FROM taxes WHERE job_id = ? GROUP BY tax_type')
    .all(jobId);
  const out = { ZKT: 0, KHRT: 0 };
  for (const r of rows) out[r.tax_type] = r.total || 0;
  return out;
}

module.exports = { listByJob, deleteByJob, insert, sumsByJob };
