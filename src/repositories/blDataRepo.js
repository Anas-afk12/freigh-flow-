// SQL for bl_data — BL-specific fields only (Improvement #3). Shipper,
// consignee, commodity, packages, weights are NOT duplicated here; they are
// read live from jobs/clients at print time. One row per job (UNIQUE job_id).
const db = require('../db/connection');

const COLS = [
  'bl_number', 'vessel', 'voyage', 'port_loading', 'port_discharge',
  'port_delivery', 'freight_terms', 'free_days', 'issued_date',
];

function getByJob(jobId) {
  return db.prepare('SELECT * FROM bl_data WHERE job_id = ?').get(jobId) || null;
}

// Upsert the single bl_data row for a job.
function upsert(jobId, data) {
  const existing = getByJob(jobId);
  const values = COLS.map((c) => (data[c] === undefined ? null : data[c]));
  if (existing) {
    db.prepare(`UPDATE bl_data SET ${COLS.map((c) => `${c} = ?`).join(', ')} WHERE job_id = ?`).run(
      ...values,
      jobId
    );
  } else {
    db.prepare(
      `INSERT INTO bl_data (job_id, ${COLS.join(', ')}) VALUES (?, ${COLS.map(() => '?').join(', ')})`
    ).run(jobId, ...values);
  }
  return getByJob(jobId);
}

module.exports = { getByJob, upsert };
