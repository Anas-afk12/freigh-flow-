// Atomic job number generation (Business Rule #4, Improvement #9).
// Format: {PREFIX}-{YEAR}-{SEQUENCE} e.g. EUMEX-2026-001. Prefix is editable
// in settings; the sequence is atomic and gap-free per year.
const sequenceRepo = require('../repositories/sequenceRepo');
const settingsRepo = require('../repositories/settingsRepo');
const { currentYear } = require('../utils/dates');

function generate() {
  const prefix = settingsRepo.get('job_prefix') || 'EUMEX';
  const year = currentYear();
  return sequenceRepo.nextJobNumber(prefix, year);
}

module.exports = { generate };
