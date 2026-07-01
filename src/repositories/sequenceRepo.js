// Atomic sequence generation for job numbers and document numbers
// (Improvement #9 / §12B). Never derived from MAX(existing) — each next()
// runs inside a transaction that increments a dedicated counter row, which
// eliminates the read-then-increment race and guarantees gap-free sequences.
const db = require('../db/connection');
const { pad3 } = require('../utils/numbers');

// Returns the next integer sequence for a given year, atomically.
const nextJobSequence = db.transaction((year) => {
  db.prepare('INSERT OR IGNORE INTO job_number_sequence (year, last_sequence) VALUES (?, 0)').run(year);
  db.prepare('UPDATE job_number_sequence SET last_sequence = last_sequence + 1 WHERE year = ?').run(year);
  return db.prepare('SELECT last_sequence FROM job_number_sequence WHERE year = ?').get(year).last_sequence;
});

// Build a full job number: {PREFIX}-{YEAR}-{SEQ} e.g. EUMEX-2026-001.
function nextJobNumber(prefix, year) {
  const seq = nextJobSequence(year);
  return `${prefix}-${year}-${pad3(seq)}`;
}

// Doc-type -> printed abbreviation used in document numbers.
const DOC_ABBR = { BL: 'BL', INVOICE: 'INV', BOOKING: 'BKG', CRO: 'CRO' };

const nextDocSequence = db.transaction((docType, year) => {
  db.prepare(
    'INSERT OR IGNORE INTO document_number_sequence (doc_type, year, last_sequence) VALUES (?, ?, 0)'
  ).run(docType, year);
  db.prepare(
    'UPDATE document_number_sequence SET last_sequence = last_sequence + 1 WHERE doc_type = ? AND year = ?'
  ).run(docType, year);
  return db
    .prepare('SELECT last_sequence FROM document_number_sequence WHERE doc_type = ? AND year = ?')
    .get(docType, year).last_sequence;
});

// Build a full document number e.g. BL-2026-001, INV-2026-001.
function nextDocNumber(docType, year) {
  const seq = nextDocSequence(docType, year);
  const abbr = DOC_ABBR[docType] || docType;
  return `${abbr}-${year}-${pad3(seq)}`;
}

module.exports = { nextJobNumber, nextDocNumber };
