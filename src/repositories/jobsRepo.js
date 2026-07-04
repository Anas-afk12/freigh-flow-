// SQL for the jobs hub table and assembling a full job view with children.
const db = require('../db/connection');
const { NotFoundError } = require('../utils/errors');
const { fromCents } = require('../utils/money');

// Columns a client may set on create/update (job_number & timestamps excluded —
// job_number is generated atomically, exchange_rate_locked is set by services).
const EDITABLE = [
  'job_type', 'direction', 'created_date', 'shipper_id', 'consignee_id',
  'notify_1_id', 'notify_2_id', 'commodity_id', 'pol_id', 'pod_id',
  'bl_number', 'packages', 'gross_weight', 'net_weight', 'marks',
  'fin_number', 'etd', 'eta', 'status', 'notes', 'internal_notes',
  'shipping_line_id',
  // Addendum R2/R4 + optional plain-storage fields
  'cbm', 'house_bl_number',
  'customs_status', 'customs_clearing_agent', 'customs_reference',
  'insurance_policy_number', 'insurance_insured_value', 'insurance_insurer',
  'vgm_kg',
];

// Monetary EDITABLE columns stored as integer cents (B1).
const MONEY_COLS = new Set(['insurance_insured_value']);

const LIST_SELECT = `
  SELECT j.id, j.job_number, j.job_type, j.direction, j.created_date, j.status,
         j.etd, j.eta, j.bl_number, j.is_archived,
         j.bl_received_date, j.bl_forwarded_date,
         s.name AS shipper_name, c.name AS consignee_name,
         co.name AS commodity_name, pol.name AS pol_name, pod.name AS pod_name,
         sl.code AS shipping_line_code
  FROM jobs j
  LEFT JOIN clients s     ON j.shipper_id   = s.id
  LEFT JOIN clients c     ON j.consignee_id = c.id
  LEFT JOIN commodities co ON j.commodity_id = co.id
  LEFT JOIN ports pol     ON j.pol_id       = pol.id
  LEFT JOIN ports pod     ON j.pod_id       = pod.id
  LEFT JOIN shipping_lines sl ON j.shipping_line_id = sl.id
`;

function list({ search = '', status = '', shippingLineId = null, includeArchived = false, page = 1, limit = 25 } = {}) {
  const clauses = [];
  const params = [];
  if (!includeArchived) clauses.push('j.is_archived = 0');
  if (status) {
    clauses.push('j.status = ?');
    params.push(status);
  }
  if (shippingLineId) {
    clauses.push('j.shipping_line_id = ?');
    params.push(shippingLineId);
  }
  if (search) {
    clauses.push('(j.job_number LIKE ? OR j.bl_number LIKE ? OR s.name LIKE ? OR c.name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM jobs j LEFT JOIN clients s ON j.shipper_id = s.id
              LEFT JOIN clients c ON j.consignee_id = c.id ${where}`)
    .get(...params).c;

  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const rows = db
    .prepare(`${LIST_SELECT} ${where} ORDER BY j.created_date DESC, j.id DESC LIMIT ? OFFSET ?`)
    .all(...params, safeLimit, offset);

  return { rows, total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) || 1 };
}

function getById(id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

// Full job with joined display names + all children (containers, rates, taxes,
// documents, bl_data). Used by the job-detail page and PDF generation.
function getFull(id) {
  const job = db
    .prepare(
      `SELECT j.*,
              s.name AS shipper_name, s.address AS shipper_address, s.tax_id AS shipper_tax_id,
              c.name AS consignee_name, c.address AS consignee_address,
              n1.name AS notify_1_name, n1.address AS notify_1_address,
              n2.name AS notify_2_name, n2.address AS notify_2_address,
              co.name AS commodity_name, co.description AS commodity_description, co.hs_code AS commodity_hs_code,
              pol.name AS pol_name, pol.code AS pol_code,
              pod.name AS pod_name, pod.code AS pod_code,
              sl.code AS shipping_line_code, sl.name AS shipping_line_name
       FROM jobs j
       LEFT JOIN clients s      ON j.shipper_id   = s.id
       LEFT JOIN clients c      ON j.consignee_id = c.id
       LEFT JOIN clients n1     ON j.notify_1_id  = n1.id
       LEFT JOIN clients n2     ON j.notify_2_id  = n2.id
       LEFT JOIN commodities co ON j.commodity_id = co.id
       LEFT JOIN ports pol      ON j.pol_id       = pol.id
       LEFT JOIN ports pod      ON j.pod_id       = pod.id
       LEFT JOIN shipping_lines sl ON j.shipping_line_id = sl.id
       WHERE j.id = ?`
    )
    .get(id);
  if (!job) return null;

  job.containers = db
    .prepare(
      `SELECT ct2.*, t.code AS container_type_code, t.description AS container_type_description
       FROM containers ct2 LEFT JOIN container_types t ON ct2.container_type_id = t.id
       WHERE ct2.job_id = ? ORDER BY ct2.id`
    )
    .all(id);
  job.rates = db
    .prepare(
      `SELECT r.*, v.name AS vendor_name FROM rates r
       LEFT JOIN clients v ON r.vendor_id = v.id WHERE r.job_id = ? ORDER BY r.rate_type, r.id`
    )
    .all(id)
    .map((r) => ({ ...r, amount: fromCents(r.amount) }));
  job.taxes = db
    .prepare('SELECT * FROM taxes WHERE job_id = ? ORDER BY tax_type')
    .all(id)
    .map((t) => ({ ...t, base_amount: fromCents(t.base_amount), amount: fromCents(t.amount) }));
  job.documents = db
    .prepare('SELECT * FROM documents WHERE job_id = ? ORDER BY generated_date DESC, id DESC')
    .all(id);
  job.bl_data = db.prepare('SELECT * FROM bl_data WHERE job_id = ?').get(id) || null;
  job.lc_amount = fromCents(job.lc_amount); // stored cents -> display units
  job.insurance_insured_value = fromCents(job.insurance_insured_value);
  return job;
}

// Create a job (+ optional containers) atomically. job_number is passed in
// already-generated by jobNumberService.
function create(jobNumber, data, containers = [], rates = []) {
  const tx = db.transaction(() => {
    // Only write columns the caller actually provided so NOT NULL columns with
    // schema defaults (job_type, direction, status) fall back correctly.
    const provided = EDITABLE.filter((c) => data[c] !== undefined && data[c] !== null && data[c] !== '');
    const cols = ['job_number', ...provided];
    const { toCents } = require('../utils/money');
    const values = [jobNumber, ...provided.map((c) => (MONEY_COLS.has(c) ? toCents(data[c]) : data[c]))];
    const placeholders = cols.map(() => '?').join(', ');
    const info = db.prepare(`INSERT INTO jobs (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
    const jobId = info.lastInsertRowid;

    const insC = db.prepare(
      `INSERT INTO containers (job_id, container_number, container_type_id, seal_number,
        vessel, voyage, status, pickup_location, pickup_date, delivery_date)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    for (const c of containers) {
      insC.run(
        jobId, c.container_number || null, c.container_type_id || null, c.seal_number || null,
        c.vessel || null, c.voyage || null, c.status || 'EMPTY', c.pickup_location || null,
        c.pickup_date || null, c.delivery_date || null
      );
    }

    // Optional rate rows (e.g. auto-filled from the master rate sheet — A3).
    // Created atomically with the job via ratesRepo so amounts store as cents.
    const ratesRepo = require('./ratesRepo');
    for (const r of rates) {
      ratesRepo.create(jobId, r);
    }
    return jobId;
  });
  return tx();
}

const NOT_NULL_COLS = new Set(['job_type', 'direction', 'status']);

function update(id, data) {
  if (!getById(id)) throw new NotFoundError(`Job #${id} not found.`);
  // Only update provided keys. Never null a NOT NULL column via an empty value.
  const cols = EDITABLE.filter((c) => {
    if (data[c] === undefined) return false;
    if (NOT_NULL_COLS.has(c) && (data[c] === null || data[c] === '')) return false;
    return true;
  });
  if (cols.length) {
    const set = cols.map((c) => `${c} = ?`).join(', ');
    const { toCents } = require('../utils/money');
    const values = cols.map((c) => {
      if (data[c] === '') return null;
      return MONEY_COLS.has(c) ? toCents(data[c]) : data[c];
    });
    db.prepare(`UPDATE jobs SET ${set} WHERE id = ?`).run(...values, id);
  }
  return getById(id);
}

function setArchived(id, archived) {
  if (!getById(id)) throw new NotFoundError(`Job #${id} not found.`);
  db.prepare('UPDATE jobs SET is_archived = ? WHERE id = ?').run(archived ? 1 : 0, id);
  return getById(id);
}

// R1 — clone a job as a fresh template: copies parties, commodity, route,
// job_type/direction, shipping line, and ALL rate rows (raw cents, so no
// double conversion) — but with a NEW job number, blank ETD/ETA/BL/containers,
// status reset to BOOKED, and no BL-tracking/LC/rebate data carried over.
function clone(sourceId, newJobNumber) {
  const src = getById(sourceId);
  if (!src) throw new NotFoundError(`Job #${sourceId} not found.`);

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO jobs
           (job_number, job_type, direction, shipper_id, consignee_id, notify_1_id,
            notify_2_id, commodity_id, pol_id, pod_id, shipping_line_id, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'BOOKED')`
      )
      .run(
        newJobNumber, src.job_type, src.direction, src.shipper_id, src.consignee_id,
        src.notify_1_id, src.notify_2_id, src.commodity_id, src.pol_id, src.pod_id,
        src.shipping_line_id
      );
    const newId = info.lastInsertRowid;

    // Copy rate rows verbatim (amounts already in cents — no conversion).
    db.prepare(
      `INSERT INTO rates (job_id, rate_type, charge_type, amount, currency, vendor_id)
       SELECT ?, rate_type, charge_type, amount, currency, vendor_id
       FROM rates WHERE job_id = ?`
    ).run(newId, sourceId);

    return newId;
  });
  return tx();
}

// A5 — LC details updated only via this targeted setter. lc_amount arrives in
// display units and is stored as integer cents (B1).
const LC_COLS = [
  'lc_number', 'lc_issuing_bank', 'lc_expiry_date', 'lc_amount', 'lc_currency',
  'lc_status', 'lc_beneficiary', 'lc_terms', 'lc_documents_required', 'lc_last_shipment_date',
];

function setLcDetails(id, data) {
  if (!getById(id)) throw new NotFoundError(`Job #${id} not found.`);
  const { toCents } = require('../utils/money');
  const values = LC_COLS.map((c) => {
    const v = data[c];
    if (v === undefined || v === null || v === '') return null;
    return c === 'lc_amount' ? toCents(v) : v;
  });
  db.prepare(`UPDATE jobs SET ${LC_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...values, id);
  return getById(id);
}

// A1 — BL tracking columns are updated only via these targeted setters,
// never through the general update path.
function setBlReceived(id, { date, from }) {
  if (!getById(id)) throw new NotFoundError(`Job #${id} not found.`);
  db.prepare('UPDATE jobs SET bl_received_date = ?, bl_received_from = ? WHERE id = ?')
    .run(date, from || null, id);
  return getById(id);
}

function setBlForwarded(id, { date, method, to }) {
  if (!getById(id)) throw new NotFoundError(`Job #${id} not found.`);
  db.prepare('UPDATE jobs SET bl_forwarded_date = ?, bl_forwarded_method = ?, bl_forwarded_to = ? WHERE id = ?')
    .run(date, method || null, to || null, id);
  return getById(id);
}

function lockExchangeRate(id, rate) {
  db.prepare('UPDATE jobs SET exchange_rate_locked = ? WHERE id = ?').run(rate, id);
}

// A job is "financially active" once any rate is PAID or any document exists —
// such jobs must be archived, never hard-deleted (Improvement #6 / Rule #5).
function isFinanciallyActive(id) {
  const paid = db.prepare("SELECT 1 FROM rates WHERE job_id = ? AND paid_status = 'PAID' LIMIT 1").get(id);
  const doc = db.prepare('SELECT 1 FROM documents WHERE job_id = ? LIMIT 1').get(id);
  return Boolean(paid || doc);
}

function remove(id) {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
}

// Dashboard quick-stats.
function stats() {
  const byStatus = db
    .prepare('SELECT status, COUNT(*) AS c FROM jobs WHERE is_archived = 0 GROUP BY status')
    .all();
  const map = { BOOKED: 0, SAILED: 0, DELIVERED: 0, CLOSED: 0, CANCELLED: 0 };
  for (const r of byStatus) map[r.status] = r.c;
  const total = db.prepare('SELECT COUNT(*) AS c FROM jobs WHERE is_archived = 0').get().c;
  return { total, ...map };
}

module.exports = {
  list, getById, getFull, create, update, setArchived,
  setBlReceived, setBlForwarded, setLcDetails, clone,
  lockExchangeRate, isFinanciallyActive, remove, stats, EDITABLE,
};
