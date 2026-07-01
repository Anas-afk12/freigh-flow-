// SQL for reports. GPSHT (one row per container) and the JOBGP base list
// (one row per job) — exactly per §12A. Profit/tax columns for JOBGP are
// computed in the reports controller via profitService + taxesRepo.
const db = require('../db/connection');

// GPSHT — operational shipment/freight tracking, one row per container.
function gpsht({ status = '', podId = null, etdFrom = '', etdTo = '', includeArchived = false } = {}) {
  const clauses = [];
  const params = [];
  if (!includeArchived) clauses.push('j.is_archived = 0');
  if (status) {
    clauses.push('j.status = ?');
    params.push(status);
  }
  if (podId) {
    clauses.push('j.pod_id = ?');
    params.push(podId);
  }
  if (etdFrom) {
    clauses.push('j.etd >= ?');
    params.push(etdFrom);
  }
  if (etdTo) {
    clauses.push('j.etd <= ?');
    params.push(etdTo);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT j.job_number, s.name AS shipper, c.container_number, c.vessel, c.voyage,
              j.etd, j.eta, j.status, j.bl_number, p.name AS pod
       FROM jobs j
       LEFT JOIN clients s     ON j.shipper_id = s.id
       LEFT JOIN containers c  ON j.id = c.job_id
       LEFT JOIN ports p       ON j.pod_id = p.id
       ${where}
       ORDER BY j.etd DESC`
    )
    .all(...params);
}

// JOBGP base job list — one row per job. Financials layered on in the controller.
function jobgpBase({ status = '', dateFrom = '', dateTo = '', includeArchived = false } = {}) {
  const clauses = [];
  const params = [];
  if (!includeArchived) clauses.push('j.is_archived = 0');
  if (status) {
    clauses.push('j.status = ?');
    params.push(status);
  }
  if (dateFrom) {
    clauses.push('j.created_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    clauses.push('j.created_date <= ?');
    params.push(dateTo);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT j.id, j.job_number, j.status, j.exchange_rate_locked, s.name AS shipper
       FROM jobs j LEFT JOIN clients s ON j.shipper_id = s.id
       ${where}
       ORDER BY j.id DESC`
    )
    .all(...params);
}

module.exports = { gpsht, jobgpBase };
