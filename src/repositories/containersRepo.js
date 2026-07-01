// SQL for the containers child table.
const db = require('../db/connection');
const { NotFoundError } = require('../utils/errors');

const COLS = [
  'container_number', 'container_type_id', 'seal_number', 'vessel', 'voyage',
  'status', 'pickup_location', 'pickup_date', 'delivery_date',
];

function listByJob(jobId) {
  return db
    .prepare(
      `SELECT c.*, t.code AS container_type_code FROM containers c
       LEFT JOIN container_types t ON c.container_type_id = t.id
       WHERE c.job_id = ? ORDER BY c.id`
    )
    .all(jobId);
}

function getById(id) {
  return db.prepare('SELECT * FROM containers WHERE id = ?').get(id);
}

function create(jobId, data) {
  const values = COLS.map((c) => (data[c] === undefined ? null : data[c]));
  const info = db
    .prepare(`INSERT INTO containers (job_id, ${COLS.join(', ')}) VALUES (?, ${COLS.map(() => '?').join(', ')})`)
    .run(jobId, ...values);
  return getById(info.lastInsertRowid);
}

function update(id, data) {
  if (!getById(id)) throw new NotFoundError(`Container #${id} not found.`);
  const values = COLS.map((c) => (data[c] === undefined ? null : data[c]));
  db.prepare(`UPDATE containers SET ${COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...values, id);
  return getById(id);
}

function remove(id) {
  if (!getById(id)) throw new NotFoundError(`Container #${id} not found.`);
  db.prepare('DELETE FROM containers WHERE id = ?').run(id);
}

module.exports = { listByJob, getById, create, update, remove };
