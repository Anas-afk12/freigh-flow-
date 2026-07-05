// Lightweight integration tests — no external test framework (keeps the app
// dependency-light for non-specialist maintainers). Run with: npm test.
// Uses a throwaway DB file so it never touches the real data.
process.env.DB_PATH = './data/test-freightflow.sqlite';

const fs = require('fs');
const path = require('path');

// Start clean.
const testDb = path.resolve(process.cwd(), process.env.DB_PATH);
for (const s of ['', '-shm', '-wal']) if (fs.existsSync(testDb + s)) fs.unlinkSync(testDb + s);

const db = require('../src/db/connection');
const { seed } = require('../src/db/seed');
const jobsRepo = require('../src/repositories/jobsRepo');
const clientsRepo = require('../src/repositories/clientsRepo');
const ratesRepo = require('../src/repositories/ratesRepo');
const profitService = require('../src/services/profitService');
const taxService = require('../src/services/taxService');
const jobNumberService = require('../src/services/jobNumberService');
const documentService = require('../src/services/documentService');
const { toUsd } = require('../src/utils/currency');

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.log(`  FAIL- ${name}`); }
}
function approx(a, b, eps = 0.01) { return Math.abs(a - b) < eps; }

seed();

console.log('Schema & seed');
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((r) => r.name);
for (const t of ['settings', 'job_number_sequence', 'document_number_sequence', 'clients', 'ports',
  'commodities', 'container_types', 'jobs', 'containers', 'rates', 'taxes', 'documents', 'bl_data']) {
  check(`table ${t} exists`, tables.includes(t));
}
check('10 clients seeded', clientsRepo.list().length === 10);
const sample = db.prepare("SELECT * FROM jobs WHERE job_number = 'EUMEX-2026-001'").get();
check('sample job EUMEX-2026-001 exists', Boolean(sample));
check('sample job has 14 rate rows', ratesRepo.listByJob(sample.id).length === 14);
check('sample job has 1 container with pickup_location', jobsRepo.getFull(sample.id).containers[0].pickup_location != null);

console.log('Currency-safe profit');
check('USD passthrough', toUsd(100, 'USD', 280) === 100);
check('PKR converts to USD', approx(toUsd(2800, 'PKR', 280), 10));
const profit = profitService.calculateProfit(sample.id, { persist: false });
// Selling: 1500+150+40+10+120+5 = 1825; Buying: 1110+100+25+7+85+3+50+2700 = 4080
check('total_selling = 1825', approx(profit.total_selling, 1825));
check('total_buying = 4080', approx(profit.total_buying, 4080));
check('profit_usd = -2255', approx(profit.profit_usd, -2255));

console.log('Money stored as integer minor units (B1)');
const rawAmount = db.prepare('SELECT amount FROM rates WHERE job_id = ? LIMIT 1').get(sample.id).amount;
check('rates.amount stored as integer cents', Number.isInteger(rawAmount) && rawAmount >= 100);
const freightRaw = db
  .prepare("SELECT amount FROM rates WHERE job_id = ? AND charge_type = 'FREIGHT' AND rate_type = 'SELLING'")
  .get(sample.id).amount;
check('seeded FREIGHT selling = 150000 cents ($1500)', freightRaw === 150000);
check('repo returns display units', ratesRepo.listByJob(sample.id).find((r) => r.charge_type === 'FREIGHT' && r.rate_type === 'SELLING').amount === 1500);

console.log('Mixed-currency aggregation (regression for the raw-sum bug)');
const mixJobId = jobsRepo.create(jobNumberService.generate(), { status: 'BOOKED' }, []);
ratesRepo.create(mixJobId, { rate_type: 'SELLING', charge_type: 'FREIGHT', amount: 1000, currency: 'USD' });
ratesRepo.create(mixJobId, { rate_type: 'SELLING', charge_type: 'LOCAL', amount: 28000, currency: 'PKR' }); // = 100 USD @280
ratesRepo.create(mixJobId, { rate_type: 'BUYING', charge_type: 'FREIGHT', amount: 500, currency: 'USD' });
const mixProfit = profitService.calculateProfit(mixJobId, { persist: true });
check('mixed selling = 1100 USD (not 29000)', approx(mixProfit.total_selling, 1100));
check('mixed profit_usd = 600', approx(mixProfit.profit_usd, 600));
check('exchange rate locked onto job', jobsRepo.getById(mixJobId).exchange_rate_locked === 280);

console.log('Taxes only on positive PKR profit');
const negTax = taxService.generateTaxes(sample.id); // sample profit is negative
check('negative-profit ZKT = 0', negTax.zkt === 0);
check('negative-profit KHRT = 0', negTax.khrt === 0);
const posTax = taxService.generateTaxes(mixJobId); // 600 USD * 280 = 168000 PKR
check('positive ZKT = 2.5% of 168000 = 4200', approx(posTax.zkt, 4200));
check('positive KHRT = 7.5% of 168000 = 12600', approx(posTax.khrt, 12600));

console.log('Atomic, gap-free job numbers');
const a = jobNumberService.generate();
const b = jobNumberService.generate();
const seqA = Number(a.split('-').pop());
const seqB = Number(b.split('-').pop());
check('job numbers increment by 1', seqB === seqA + 1);
check('job number format PREFIX-YEAR-SEQ', /^EUMEX-\d{4}-\d{3,}$/.test(a));

console.log('Document generation + numbering');
const bl = documentService.generate(sample.id, 'BL');
check('BL PDF produced', bl.buffer.length > 1000);
check('BL number format BL-YEAR-SEQ', /^BL-\d{4}-\d{3,}$/.test(bl.docNumber));
check('document recorded in audit table', jobsRepo.getFull(sample.id).documents.some((d) => d.doc_number === bl.docNumber));

console.log('Soft-archive rule for financially active jobs');
check('sample job is financially active (has docs)', jobsRepo.isFinanciallyActive(sample.id) === true);

console.log('Migrations (B2)');
const applied = db.prepare('SELECT name FROM schema_migrations ORDER BY name').all().map((r) => r.name);
check('7 migrations applied in order', applied.length === 7 && applied[0] === '001-rate-sheet.js' && applied[6] === '007-domain-addendum.js');

console.log('Master rate sheet + auto-fill match (A3)');
const { masterRates, localCharges, shippingLines } = require('../src/repositories/rateSheetRepo');
check('shipping lines seeded (WHL..FENGHAI)', shippingLines.list().length === 5);
check('local charges seeded (6 types)', localCharges.list().length === 6);
const mr = masterRates.create({ destination_port_id: 1, container_type_id: 2, freight_buying: 1110, freight_selling: 1500 });
check('master rate stores cents, returns display units', mr.freight_selling === 1500
  && db.prepare('SELECT freight_selling FROM master_rates WHERE id = ?').get(mr.id).freight_selling === 150000);
check('match finds the row', masterRates.match(1, 2).id === mr.id);
check('no-match returns undefined (auto-fill silently does nothing)', masterRates.match(1, 999) === undefined);

console.log('Rebates & adjusted profit (A2)');
const rebatesRepo = require('../src/repositories/rebatesRepo');
rebatesRepo.create(mixJobId, { type: 'CLIENT_REBATE', amount: 100, currency: 'USD' });
rebatesRepo.create(mixJobId, { type: 'LINE_REBATE', amount: 50, currency: 'USD' });
rebatesRepo.create(mixJobId, { type: 'AGENT_COMMISSION', amount: 28000, currency: 'PKR' }); // 100 USD @280
const adj = profitService.calculateAdjustedProfit(mixJobId);
// gross 600 − 100 + 50 − 100 = 450
check('adjusted profit = 600 − 100 + 50 − 100 = 450', approx(adj.adjusted_profit_usd, 450));
check('gross profit unchanged by rebates', approx(adj.profit_usd, 600));
const plainAdj = profitService.calculateAdjustedProfit(sample.id);
check('job without rebates: adjusted == gross', plainAdj.adjusted_profit_usd === plainAdj.profit_usd);

console.log('Job cloning (R1)');
const cloneId = jobsRepo.clone(sample.id, 'EUMEX-9999-001');
const cloned = jobsRepo.getFull(cloneId);
check('clone has new number + BOOKED status', cloned.job_number === 'EUMEX-9999-001' && cloned.status === 'BOOKED');
check('clone copies parties & route', cloned.shipper_id === sample.shipper_id && cloned.pod_id === sample.pod_id);
check('clone copies all 14 rate rows', cloned.rates.length === 14);
check('clone rate amounts NOT double-converted', cloned.rates.find((r) => r.charge_type === 'FREIGHT' && r.rate_type === 'SELLING').amount === 1500);
check('clone leaves ETD/BL/containers blank', cloned.etd == null && cloned.bl_number == null && cloned.containers.length === 0);

console.log('BL tracking (A1) + LC (A5)');
jobsRepo.setBlReceived(cloneId, { date: '2026-03-01', from: 'WHL KHI' });
check('bl received recorded', jobsRepo.getById(cloneId).bl_received_date === '2026-03-01');
jobsRepo.setLcDetails(cloneId, { lc_number: 'LC-123', lc_amount: 5000, lc_currency: 'USD' });
check('lc_amount stored as cents', db.prepare('SELECT lc_amount FROM jobs WHERE id = ?').get(cloneId).lc_amount === 500000);
check('lc_amount returned in display units', jobsRepo.getFull(cloneId).lc_amount === 5000);

console.log('Payables aging (R3)');
const reportsRepo = require('../src/repositories/reportsRepo');
const aging = reportsRepo.payablesAging();
check('unpaid buying rates appear in aging', aging.length >= 8);
check('aging rows carry vendor + days_outstanding', aging.some((r) => r.vendor != null) && aging.every((r) => Number.isInteger(r.days_outstanding)));

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);

// Cleanup throwaway db.
for (const s of ['', '-shm', '-wal']) if (fs.existsSync(testDb + s)) { try { fs.unlinkSync(testDb + s); } catch (e) { /* ignore */ } }

process.exit(failed === 0 ? 0 : 1);
