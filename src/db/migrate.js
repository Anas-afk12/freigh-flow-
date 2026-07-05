// Migration runner (hardening B2).
//
// schema.js is FROZEN as the baseline schema — from now on, every schema
// change lives in src/db/migrations/NNN-name.js (exporting { name, up(db) })
// and is applied here exactly once, in filename order, inside a transaction.
// Applied migrations are recorded in schema_migrations, so a live database
// upgrades in place: existing rows are never touched, no db:reset required.
const fs = require('fs');
const path = require('path');
const db = require('./connection');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function ensureTrackingTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function pendingMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name)
  );
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+.*\.js$/.test(f))
    .sort()
    .filter((f) => !applied.has(f));
}

function runMigrations({ log = false } = {}) {
  ensureTrackingTable();
  const pending = pendingMigrations();
  for (const file of pending) {
    const migration = require(path.join(MIGRATIONS_DIR, file));
    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    });
    apply();
    if (log) console.log(`migrated: ${file}`);
  }
  return pending.length;
}

if (require.main === module) {
  const n = runMigrations({ log: true });
  console.log(n === 0 ? 'No pending migrations.' : `${n} migration(s) applied.`);
}

module.exports = { runMigrations };
