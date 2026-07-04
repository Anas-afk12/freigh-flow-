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

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);

// Cleanup throwaway db.
for (const s of ['', '-shm', '-wal']) if (fs.existsSync(testDb + s)) { try { fs.unlinkSync(testDb + s); } catch (e) { /* ignore */ } }

process.exit(failed === 0 ? 0 : 1);
