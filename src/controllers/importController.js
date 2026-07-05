// A7 — CSV import: the Excel on-ramp. Flow: POST csv text to /preview →
// parsed rows + auto-suggested column mapping (adjustable in the UI) →
// POST mapped records to /commit → duplicates (by natural key) are skipped
// and reported, never silently overwritten. Strictly additive.
const { ok, asyncHandler } = require('./respond');
const { ValidationError } = require('../utils/errors');
const { parseCsv } = require('../utils/csv');

const clientsRepo = require('../repositories/clientsRepo');
const portsRepo = require('../repositories/portsRepo');
const commoditiesRepo = require('../repositories/commoditiesRepo');
const containerTypesRepo = require('../repositories/containerTypesRepo');
const { masterRates, localCharges, shippingLines } = require('../repositories/rateSheetRepo');

// Per-target config: importable fields, natural key, existence check, insert.
const TARGETS = {
  clients: {
    fields: ['name', 'type', 'address', 'phone', 'email', 'contact_person', 'tax_id'],
    required: ['name', 'type'],
    keyOf: (r) => (r.name || '').toUpperCase(),
    existingKeys: () => new Set(clientsRepo.list().map((c) => c.name.toUpperCase())),
    insert: (r) => {
      const type = String(r.type || '').toUpperCase();
      if (!['SHIPPER', 'CONSIGNEE', 'NOTIFY', 'VENDOR'].includes(type)) {
        throw new ValidationError(`Invalid client type '${r.type}' — must be SHIPPER/CONSIGNEE/NOTIFY/VENDOR.`);
      }
      clientsRepo.create({ ...r, type });
    },
  },
  ports: {
    fields: ['name', 'code', 'country'],
    required: ['name'],
    keyOf: (r) => (r.name || '').toUpperCase(),
    existingKeys: () => new Set(portsRepo.list().map((p) => p.name.toUpperCase())),
    insert: (r) => portsRepo.create(r),
  },
  commodities: {
    fields: ['name', 'hs_code', 'description'],
    required: ['name'],
    keyOf: (r) => (r.name || '').toUpperCase(),
    existingKeys: () => new Set(commoditiesRepo.list().map((c) => c.name.toUpperCase())),
    insert: (r) => commoditiesRepo.create(r),
  },
  'container-types': {
    fields: ['code', 'description', 'weight_limit'],
    required: ['code'],
    keyOf: (r) => (r.code || '').toUpperCase(),
    existingKeys: () => new Set(containerTypesRepo.list().map((c) => c.code.toUpperCase())),
    insert: (r) => containerTypesRepo.create(r),
  },
  'shipping-lines': {
    fields: ['code', 'name'],
    required: ['code'],
    keyOf: (r) => (r.code || '').toUpperCase(),
    existingKeys: () => new Set(shippingLines.list().map((l) => l.code.toUpperCase())),
    insert: (r) => shippingLines.create({ ...r, code: String(r.code).toUpperCase() }),
  },
  'local-charges': {
    fields: ['charge_type', 'amount_20', 'amount_40', 'amount_40hc', 'currency'],
    required: ['charge_type'],
    keyOf: (r) => (r.charge_type || '').toUpperCase(),
    existingKeys: () => new Set(localCharges.list().filter((c) => c.amount_20 != null || c.amount_40 != null || c.amount_40hc != null).map((c) => c.charge_type.toUpperCase())),
    insert: (r) => localCharges.upsert(String(r.charge_type).toUpperCase(), r),
  },
  'master-rates': {
    // Ports/container types referenced BY NAME in the CSV, resolved to ids.
    fields: [
      'destination_port', 'container_type',
      'freight_buying', 'freight_selling', 'placement_buying', 'placement_selling',
      'lifting_buying', 'lifting_selling', 'bl_charges_buying', 'bl_charges_selling',
      'cro_buying', 'cro_selling', 'seal_buying', 'seal_selling',
    ],
    required: ['destination_port', 'container_type'],
    keyOf: (r) => `${(r.destination_port || '').toUpperCase()}|${(r.container_type || '').toUpperCase()}`,
    existingKeys: () => new Set(masterRates.list().map((m) => `${(m.port_name || '').toUpperCase()}|${(m.container_type_code || '').toUpperCase()}`)),
    insert: (r) => {
      const port = portsRepo.list({ search: '' }).find((p) => p.name.toUpperCase() === String(r.destination_port).toUpperCase());
      const ct = containerTypesRepo.list().find((c) => c.code.toUpperCase() === String(r.container_type).toUpperCase());
      if (!port) throw new ValidationError(`Unknown port '${r.destination_port}' — import ports first.`);
      if (!ct) throw new ValidationError(`Unknown container type '${r.container_type}' — import container types first.`);
      masterRates.create({ ...r, destination_port_id: port.id, container_type_id: ct.id });
    },
  },
};

function getTarget(name) {
  const t = TARGETS[name];
  if (!t) throw new ValidationError(`Unknown import target '${name}'. Valid: ${Object.keys(TARGETS).join(', ')}`);
  return t;
}

// Suggest a mapping: csv header -> target field, by normalized name similarity.
function suggestMapping(headers, fields) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const mapping = {};
  for (const h of headers) {
    const nh = norm(h);
    const hit = fields.find((f) => norm(f) === nh) || fields.find((f) => nh.includes(norm(f)) || norm(f).includes(nh));
    if (hit && !Object.values(mapping).includes(hit)) mapping[h] = hit;
  }
  return mapping;
}

// POST /api/import/:target/preview  { csv: "..." }
const preview = asyncHandler(async (req, res) => {
  const target = getTarget(req.params.target);
  const csvText = req.body && req.body.csv;
  if (!csvText || typeof csvText !== 'string') throw new ValidationError('Body must include csv text.');

  const { headers, rows } = parseCsv(csvText);
  if (!headers.length) throw new ValidationError('CSV appears to be empty.');

  const mapping = suggestMapping(headers, target.fields);
  const existing = target.existingKeys();

  // Apply suggested mapping to flag duplicates in the preview.
  const mapped = rows.map((row) => {
    const rec = {};
    for (const [h, f] of Object.entries(mapping)) rec[f] = row[h];
    return rec;
  });
  const duplicates = mapped.filter((r) => existing.has(target.keyOf(r))).length;

  ok(res, {
    headers,
    fields: target.fields,
    required: target.required,
    suggested_mapping: mapping,
    row_count: rows.length,
    duplicate_count: duplicates,
    sample_rows: rows.slice(0, 10),
  });
});

// POST /api/import/:target/commit  { records: [ {field: value} ] }
const commit = asyncHandler(async (req, res) => {
  const target = getTarget(req.params.target);
  const records = req.body && req.body.records;
  if (!Array.isArray(records)) throw new ValidationError('Body must include a records array.');

  const existing = target.existingKeys();
  const seen = new Set();
  let inserted = 0;
  const skipped = [];
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const missing = target.required.filter((f) => !r[f] || String(r[f]).trim() === '');
    if (missing.length) {
      errors.push({ row: i + 1, reason: `Missing required: ${missing.join(', ')}` });
      continue;
    }
    const key = target.keyOf(r);
    if (existing.has(key) || seen.has(key)) {
      skipped.push({ row: i + 1, key, reason: 'Duplicate — already exists' });
      continue;
    }
    try {
      target.insert(r);
      seen.add(key);
      inserted++;
    } catch (e) {
      errors.push({ row: i + 1, reason: e.message });
    }
  }

  ok(res, { inserted, skipped_count: skipped.length, skipped, error_count: errors.length, errors });
});

module.exports = { preview, commit };
