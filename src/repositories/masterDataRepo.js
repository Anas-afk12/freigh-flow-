// Shared master-data repository factory. clients/ports/commodities/
// container_types all follow the same shape: CRUD + search + active/inactive
// toggling (never hard-deleted where historically referenced — Improvement #6).
// Per-table repos wrap this factory with their own column list.
const db = require('../db/connection');
const { NotFoundError } = require('../utils/errors');

function createRepo(table, columns, searchColumns, orderBy = 'name') {
  const insertCols = columns.join(', ');
  const insertPlaceholders = columns.map(() => '?').join(', ');
  const updateSet = columns.map((c) => `${c} = ?`).join(', ');

  function list({ search = '', activeOnly = false } = {}) {
    const clauses = [];
    const params = [];
    if (activeOnly) clauses.push('is_active = 1');
    if (search) {
      const like = searchColumns.map((c) => `${c} LIKE ?`).join(' OR ');
      clauses.push(`(${like})`);
      for (let i = 0; i < searchColumns.length; i++) params.push(`%${search}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return db.prepare(`SELECT * FROM ${table} ${where} ORDER BY ${orderBy} COLLATE NOCASE`).all(...params);
  }

  function getById(id) {
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  }

  function create(data) {
    const values = columns.map((c) => (data[c] === undefined ? null : data[c]));
    const info = db
      .prepare(`INSERT INTO ${table} (${insertCols}) VALUES (${insertPlaceholders})`)
      .run(...values);
    return getById(info.lastInsertRowid);
  }

  function update(id, data) {
    if (!getById(id)) throw new NotFoundError(`${table} #${id} not found.`);
    const values = columns.map((c) => (data[c] === undefined ? null : data[c]));
    db.prepare(`UPDATE ${table} SET ${updateSet} WHERE id = ?`).run(...values, id);
    return getById(id);
  }

  // Soft toggle rather than delete — preserves historical references.
  function setActive(id, isActive) {
    if (!getById(id)) throw new NotFoundError(`${table} #${id} not found.`);
    db.prepare(`UPDATE ${table} SET is_active = ? WHERE id = ?`).run(isActive ? 1 : 0, id);
    return getById(id);
  }

  return { list, getById, create, update, setActive };
}

module.exports = { createRepo };
