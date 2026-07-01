// All SQL for the settings key/value table.
const db = require('../db/connection');

function getAll() {
  return db.prepare('SELECT key, value, updated_at FROM settings ORDER BY key').all();
}

function getMap() {
  const rows = getAll();
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

function get(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getNumber(key, fallback = 0) {
  const v = get(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Upsert a single key. updated_at maintained explicitly (no trigger needed).
function set(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(key, String(value));
}

// Upsert many keys atomically.
const setMany = db.transaction((entries) => {
  for (const [key, value] of Object.entries(entries)) set(key, value);
});

module.exports = { getAll, getMap, get, getNumber, set, setMany };
