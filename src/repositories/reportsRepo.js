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
              j.etd, j.eta, j.status, j.bl_number, p.name AS pod,
              CASE WHEN j.bl_forwarded_date IS NOT NULL THEN 'FORWARDED'
                   WHEN j.bl_received_date  IS NOT NULL THEN 'RECEIVED'
                   ELSE 'NOT_RECEIVED' END AS bl_status
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

// R3 — Accounts Payable aging: unpaid BUYING rates grouped by vendor, days
// outstanding from the rate's created_at, oldest first. Amounts in raw cents;
// the controller converts for display. No schema change — data already exists.
function payablesAging() {
  return db
    .prepare(
      `SELECT v.name AS vendor, r.charge_type, r.amount, r.currency,
              r.invoice_number, j.job_number, DATE(r.created_at) AS incurred_date,
              CAST(julianday('now') - julianday(r.created_at) AS INTEGER) AS days_outstanding
       FROM rates r
       LEFT JOIN clients v ON r.vendor_id = v.id
       LEFT JOIN jobs j    ON r.job_id = j.id
       WHERE r.rate_type = 'BUYING' AND r.paid_status = 'UNPAID'
       ORDER BY r.created_at ASC, v.name`
    )
    .all();
}

module.exports = { gpsht, jobgpBase, payablesAging };
