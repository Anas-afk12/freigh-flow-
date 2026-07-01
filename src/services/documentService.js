// PDF generation orchestration (§12B). For a given job + doc type it:
//   1. loads the full job (live parties/commodity/containers/bl_data),
//   2. allocates an atomic per-(doc_type, year) document number,
//   3. renders the PDF via the matching template,
//   4. records a documents row (audit trail),
//   5. returns the PDF buffer + doc number.
const jobsRepo = require('../repositories/jobsRepo');
const ratesRepo = require('../repositories/ratesRepo');
const settingsRepo = require('../repositories/settingsRepo');
const documentsRepo = require('../repositories/documentsRepo');
const sequenceRepo = require('../repositories/sequenceRepo');
const { currentYear } = require('../utils/dates');
const { NotFoundError, ValidationError } = require('../utils/errors');

const blTemplate = require('../pdf/blTemplate');
const invoiceTemplate = require('../pdf/invoiceTemplate');
const bookingTemplate = require('../pdf/bookingTemplate');
const croTemplate = require('../pdf/croTemplate');

const TEMPLATES = {
  BL: { docType: 'BL', build: blTemplate.build },
  INVOICE: { docType: 'INVOICE', build: invoiceTemplate.build },
  BOOKING: { docType: 'BOOKING', build: bookingTemplate.build },
  CRO: { docType: 'CRO', build: croTemplate.build },
};

function generate(jobId, kind) {
  const spec = TEMPLATES[kind];
  if (!spec) throw new ValidationError(`Unknown document type: ${kind}`);

  const job = jobsRepo.getFull(jobId);
  if (!job) throw new NotFoundError(`Job #${jobId} not found.`);

  const settings = settingsRepo.getMap();
  const docNumber = sequenceRepo.nextDocNumber(spec.docType, currentYear());

  const context = { job, settings, docNumber };
  if (kind === 'INVOICE') context.sellingRates = ratesRepo.sellingByJob(jobId);

  const { buffer } = spec.build(context);

  documentsRepo.record(jobId, { doc_type: spec.docType, doc_number: docNumber });
  return { buffer, docNumber, filename: `${docNumber}.pdf` };
}

module.exports = { generate };
