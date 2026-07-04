// SQL for the A3 rate-sheet tables: master_rates, local_charges,
// shipping_lines. All monetary columns are stored as integer cents; this repo
// converts to/from display units at the boundary.
const db = require('../db/connection');
const { NotFoundError } = require('../utils/errors');
const { toCents, fromCents } = require('../utils/money');

const MR_MONEY = [
  'freight_buying', 'freight_selling', 'placement_buying', 'placement_selling',
  'lifting_buying', 'lifting_selling', 'bl_charges_buying', 'bl_charges_selling',
  'cro_buying', 'cro_selling', 'seal_buying', 'seal_selling',
];
const LC_MONEY = ['amount_20', 'amount_40', 'amount_40hc'];

function mrToDisplay(row) {
  if (!row) return row;
  const out = { ...row };
  for (const c of MR_MONEY) out[c] = fromCents(row[c]);
  return out;
}
function lcToDisplay(row) {
  if (!row) return row;
  const out = { ...row };
  for (const c of LC_MONEY) out[c] = fromCents(row[c]);
  return out;
}

// ---- master_rates ----
const masterRates = {
  list() {
    return db
      .prepare(
        `SELECT mr.*, p.name AS port_name, ct.code AS container_type_code
         FROM master_rates mr
         LEFT JOIN ports p ON mr.destination_port_id = p.id
         LEFT JOIN container_types ct ON mr.container_type_id = ct.id
         ORDER BY p.name, ct.code`
      )
      .all()
      .map(mrToDisplay);
  },
  getById(id) {
    return mrToDisplay(db.prepare('SELECT * FROM master_rates WHERE id = ?').get(id));
  },
  // The auto-fill lookup: one row for a POD + container type, or undefined.
  match(podId, containerTypeId) {
    return mrToDisplay(
      db
        .prepare('SELECT * FROM master_rates WHERE destination_port_id = ? AND container_type_id = ?')
        .get(podId, containerTypeId)
    );
  },
  create(data) {
    const cols = ['destination_port_id', 'container_type_id', 'currency', ...MR_MONEY];
    const values = cols.map((c) => {
      if (data[c] === undefined || data[c] === null || data[c] === '') return c === 'currency' ? 'USD' : null;
      return MR_MONEY.includes(c) ? toCents(data[c]) : data[c];
    });
    const info = db
      .prepare(`INSERT INTO master_rates (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...values);
    return masterRates.getById(info.lastInsertRowid);
  },
  update(id, data) {
    if (!masterRates.getById(id)) throw new NotFoundError(`Master rate #${id} not found.`);
    const cols = ['destination_port_id', 'container_type_id', 'currency', ...MR_MONEY];
    const values = cols.map((c) => {
      if (data[c] === undefined || data[c] === null || data[c] === '') return c === 'currency' ? 'USD' : null;
      return MR_MONEY.includes(c) ? toCents(data[c]) : data[c];
    });
    db.prepare(`UPDATE master_rates SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...values, id);
    return masterRates.getById(id);
  },
  remove(id) {
    if (!masterRates.getById(id)) throw new NotFoundError(`Master rate #${id} not found.`);
    db.prepare('DELETE FROM master_rates WHERE id = ?').run(id);
  },
};

// ---- local_charges ----
const localCharges = {
  list() {
    return db.prepare('SELECT * FROM local_charges ORDER BY charge_type').all().map(lcToDisplay);
  },
  getByType(chargeType) {
    return lcToDisplay(db.prepare('SELECT * FROM local_charges WHERE charge_type = ?').get(chargeType));
  },
  upsert(chargeType, data) {
    const existing = db.prepare('SELECT id FROM local_charges WHERE charge_type = ?').get(chargeType);
    const vals = LC_MONEY.map((c) => (data[c] === undefined || data[c] === null || data[c] === '' ? null : toCents(data[c])));
    const currency = data.currency || 'USD';
    if (existing) {
      db.prepare(
        `UPDATE local_charges SET amount_20 = ?, amount_40 = ?, amount_40hc = ?, currency = ?, updated_at = CURRENT_TIMESTAMP
         WHERE charge_type = ?`
      ).run(...vals, currency, chargeType);
    } else {
      db.prepare(
        'INSERT INTO local_charges (charge_type, amount_20, amount_40, amount_40hc, currency) VALUES (?,?,?,?,?)'
      ).run(chargeType, ...vals, currency);
    }
    return localCharges.getByType(chargeType);
  },
};

// ---- shipping_lines ----
const shippingLines = {
  list({ activeOnly = false } = {}) {
    const where = activeOnly ? 'WHERE is_active = 1' : '';
    return db.prepare(`SELECT * FROM shipping_lines ${where} ORDER BY code`).all();
  },
  getById(id) {
    return db.prepare('SELECT * FROM shipping_lines WHERE id = ?').get(id);
  },
  create(data) {
    const info = db
      .prepare('INSERT INTO shipping_lines (code, name) VALUES (?, ?)')
      .run(data.code, data.name || null);
    return shippingLines.getById(info.lastInsertRowid);
  },
  update(id, data) {
    if (!shippingLines.getById(id)) throw new NotFoundError(`Shipping line #${id} not found.`);
    db.prepare('UPDATE shipping_lines SET code = ?, name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(data.code, data.name || null, id);
    return shippingLines.getById(id);
  },
  setActive(id, isActive) {
    if (!shippingLines.getById(id)) throw new NotFoundError(`Shipping line #${id} not found.`);
    db.prepare('UPDATE shipping_lines SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(isActive ? 1 : 0, id);
    return shippingLines.getById(id);
  },
};

module.exports = { masterRates, localCharges, shippingLines };
