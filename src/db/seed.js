// Seeds settings + master data + one fully-worked sample job (EUMEX-2026-001)
// using the exact seed data from the build spec. Idempotent: it checks whether
// data already exists and skips, so it is safe to run on every boot.
const db = require('./connection');
const { createSchema } = require('./schema');
const { toCents } = require('../utils/money');

const SETTINGS = [
  ['job_prefix', 'EUMEX'],
  ['exchange_rate', '280'],
  ['zkt_percentage', '2.5'],
  ['khrt_percentage', '7.5'],
  ['company_name', 'EUMEX FREIGHT FORWARDING (PVT) LTD'],
  ['company_address', 'Office 12, Shipping Plaza, I.I. Chundrigar Road, Karachi, Pakistan'],
  ['company_phone', '+92 21 111 386 639'],
  ['company_email', 'operations@eumex.com'],
  ['bank_details', 'Bank Alfalah — Account: 0123-4567890 — IBAN: PK00ALFH0000001234567890'],
];

const CLIENTS = [
  ['M.MUNIR AND SONS', 'SHIPPER', 'RAILWAY ROAD, RIYADH', '1234567', 'info@mmunir.com', 'Mr. Munir', 'TAX-001'],
  ['BANK ALFALAH', 'CONSIGNEE', 'BANK ROAD, LAHORE', '7654321', 'info@bankalfalah.com', 'Mr. Ali', 'TAX-002'],
  ['DIHA AL MARIFA TRADING EST', 'NOTIFY', 'P.O.BOX 31799, ALKHOBAR 31952', '+966500189429', 'dm.ksa@yahoo.com', 'Mr. Ahmed', 'TAX-003'],
  ['DURRA SABAH TRADING COMPANY', 'NOTIFY', 'AL SULAE AREA, RIYADH', '+966500189429', 'dm.ksa@yahoo.com', 'Mr. Khalid', 'TAX-004'],
  ['MEEZAN BANK LIMITED', 'CONSIGNEE', 'ZAHOOR ELAHI ROAD, LAHORE', '1122334', 'info@meezan.com', 'Mr. Hassan', 'TAX-005'],
  ['MEPCO CHEMICALS', 'SHIPPER', '16.5 KM SHEIKHU, JEDDAH', '5544332', 'info@mepco.com', 'Mr. Fahad', 'TAX-006'],
  ['ASIA ENTERPRISE', 'SHIPPER', 'CHAH BALANDAY, KARACHI', '6677889', 'info@asia.com', 'Mr. Imran', 'TAX-007'],
  ['KTM LEATHER', 'SHIPPER', 'MEHR MANZIL, LC QINGDAO', '9988776', 'info@ktm.com', 'Mr. Raza', 'TAX-008'],
  ['TAQ ENTP CARGO SERVICES PVT LTD', 'VENDOR', 'CARGO ROAD, KARACHI', '4433221', 'info@taq.com', 'Mr. Tariq', 'TAX-009'],
  ['H&H ENTERPRISES', 'VENDOR', 'ENTERPRISE ROAD, LAHORE', '5566778', 'info@hh.com', 'Mr. Hamid', 'TAX-010'],
];

const PORTS = [
  ['JEDDAH', 'JED', 'SAUDI ARABIA'],
  ['DAMMAM', 'DAM', 'SAUDI ARABIA'],
  ['RIYADH', 'RUH', 'SAUDI ARABIA'],
  ['KARACHI', 'KHI', 'PAKISTAN'],
  ['QINGDAO', 'QIN', 'CHINA'],
  ['JEBELALI', 'JEA', 'UAE'],
  ['HAMAD', 'HAM', 'QATAR'],
];

const COMMODITIES = [
  ['TENT', '6306', 'Tents and camping equipment'],
  ['NIWAR', '6306', 'Canvas and ropes'],
  ['CANVAS', '6306', 'Canvas rolls'],
  ['LEATHER', '4107', 'Leather goods'],
  ['CHEMICALS', '2800', 'Industrial chemicals'],
];

const CONTAINER_TYPES = [
  ['1x20', '20-foot container', 28000],
  ['1x40', '40-foot container', 30000],
  ['1x40HC', '40-foot high cube', 30000],
  ['20RFR', '20-foot reefer', 27000],
  ['40RFR', '40-foot reefer', 29000],
];

const BUYING_RATES = [
  ['FREIGHT', 1110, 'USD'],
  ['PLACEMENT', 100, 'USD'],
  ['LIFT ON', 25, 'USD'],
  ['SEAL', 7, 'USD'],
  ['BL CHARGES', 85, 'USD'],
  ['CRO', 3, 'USD'],
  ['SURRENDER/TLX', 50, 'USD'],
  ['LIFT OFF', 2700, 'USD'],
];

const SELLING_RATES = [
  ['FREIGHT', 1500, 'USD'],
  ['PLACEMENT', 150, 'USD'],
  ['LIFT ON', 40, 'USD'],
  ['SEAL', 10, 'USD'],
  ['BL CHARGES', 120, 'USD'],
  ['CRO', 5, 'USD'],
];

function seed() {
  createSchema();
  // Apply any pending schema migrations before seeding (B2). schema.js is the
  // frozen baseline; all newer schema work lives in src/db/migrations/.
  require('./migrate').runMigrations();

  const seedTx = db.transaction(() => {
    // Settings — insert-or-ignore so re-runs never clobber user edits.
    const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of SETTINGS) insSetting.run(key, value);

    const clientCount = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
    if (clientCount > 0) {
      return { skipped: true };
    }

    const insClient = db.prepare(
      'INSERT INTO clients (name, type, address, phone, email, contact_person, tax_id) VALUES (?,?,?,?,?,?,?)'
    );
    for (const c of CLIENTS) insClient.run(...c);

    const insPort = db.prepare('INSERT INTO ports (name, code, country) VALUES (?,?,?)');
    for (const p of PORTS) insPort.run(...p);

    const insCommodity = db.prepare('INSERT INTO commodities (name, hs_code, description) VALUES (?,?,?)');
    for (const c of COMMODITIES) insCommodity.run(...c);

    const insCT = db.prepare('INSERT INTO container_types (code, description, weight_limit) VALUES (?,?,?)');
    for (const ct of CONTAINER_TYPES) insCT.run(...ct);

    // Resolve seeded master-data ids by their natural keys.
    const clientId = (name) => db.prepare('SELECT id FROM clients WHERE name = ?').get(name).id;
    const portId = (name) => db.prepare('SELECT id FROM ports WHERE name = ?').get(name).id;
    const commodityId = (name) => db.prepare('SELECT id FROM commodities WHERE name = ?').get(name).id;
    const ctId = (code) => db.prepare('SELECT id FROM container_types WHERE code = ?').get(code).id;

    // Sample job EUMEX-2026-001 (POL Karachi, POD Jeddah, export/FCL).
    const jobInfo = db
      .prepare(
        `INSERT INTO jobs
          (job_number, job_type, direction, created_date, shipper_id, consignee_id,
           notify_1_id, notify_2_id, commodity_id, pol_id, pod_id, bl_number, packages,
           gross_weight, net_weight, marks, fin_number, etd, eta, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        'EUMEX-2026-001', 'FCL', 'EXPORT', '2026-01-20',
        clientId('M.MUNIR AND SONS'), clientId('BANK ALFALAH'),
        clientId('DIHA AL MARIFA TRADING EST'), clientId('DURRA SABAH TRADING COMPANY'),
        commodityId('TENT'), portId('KARACHI'), portId('JEDDAH'),
        '078G100088', 193, 15450, 15350, '193', 'MBL-EXP-861186-12122025',
        '2026-01-25', '2026-02-10', 'BOOKED'
      );
    const jobId = jobInfo.lastInsertRowid;

    // Keep the year sequence consistent with the seeded job number.
    db.prepare('INSERT OR REPLACE INTO job_number_sequence (year, last_sequence) VALUES (?, ?)').run(2026, 1);

    db.prepare(
      `INSERT INTO containers (job_id, container_number, container_type_id, vessel, voyage, status, pickup_location)
       VALUES (?,?,?,?,?,?,?)`
    ).run(jobId, 'WHUS667790', ctId('1x40'), 'CELSIUS EMMEN 20', '20', 'FULL', 'KARACHI EMPTY DEPOT');

    const vendorId = clientId('TAQ ENTP CARGO SERVICES PVT LTD');
    const insBuy = db.prepare(
      'INSERT INTO rates (job_id, rate_type, charge_type, amount, currency, vendor_id) VALUES (?,?,?,?,?,?)'
    );
    for (const [charge, amount, cur] of BUYING_RATES) insBuy.run(jobId, 'BUYING', charge, toCents(amount), cur, vendorId);

    const insSell = db.prepare(
      'INSERT INTO rates (job_id, rate_type, charge_type, amount, currency) VALUES (?,?,?,?,?)'
    );
    for (const [charge, amount, cur] of SELLING_RATES) insSell.run(jobId, 'SELLING', charge, toCents(amount), cur);

    return { skipped: false, jobId };
  });

  return seedTx();
}

if (require.main === module) {
  const result = seed();
  if (result.skipped) {
    console.log('Seed skipped — data already present (settings ensured).');
  } else {
    console.log(`Seed complete. Sample job EUMEX-2026-001 created (id ${result.jobId}).`);
  }
}

module.exports = { seed };
