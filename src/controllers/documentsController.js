// Documents controller: streams a generated PDF back to the client and records
// the generation in the documents table (via documentService).
const { asyncHandler } = require('./respond');
const { parseId } = require('../middleware/validate');
const documentService = require('../services/documentService');

function makeHandler(kind) {
  return asyncHandler(async (req, res) => {
    const jobId = parseId(req.params.jobId, 'jobId');
    const { buffer, filename } = documentService.generate(jobId, kind);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  });
}

module.exports = {
  bl: makeHandler('BL'),
  invoice: makeHandler('INVOICE'),
  booking: makeHandler('BOOKING'),
  cro: makeHandler('CRO'),
};
