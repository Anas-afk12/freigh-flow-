// SQL for the documents child table (audit of generated BL/INVOICE/BOOKING/CRO).
const db = require('../db/connection');

function listByJob(jobId) {
  return db
    .prepare('SELECT * FROM documents WHERE job_id = ? ORDER BY generated_date DESC, id DESC')
    .all(jobId);
}

function record(jobId, { doc_type, doc_number, file_path = null }) {
  const info = db
    .prepare('INSERT INTO documents (job_id, doc_type, doc_number, file_path) VALUES (?,?,?,?)')
    .run(jobId, doc_type, doc_number, file_path);
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = { listByJob, record };
