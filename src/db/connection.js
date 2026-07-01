// Single shared SQLite connection for the whole app.
//
// Production target is better-sqlite3 (synchronous, native) — required for
// safe atomic multi-table writes (job+containers, profit+tax generation) and
// for Electron packaging via electron-rebuild.
//
// In a network-restricted sandbox where the native module cannot be compiled
// or fetched as a prebuilt binary, we transparently fall back to Node's
// built-in node:sqlite (DatabaseSync, Node 22.5+) behind a thin shim that
// mimics the small slice of the better-sqlite3 API this app uses. All
// application/repository code targets the better-sqlite3 API exclusively, so
// nothing downstream needs to know which backend is active.
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, '..', '..', 'data', 'freightflow.sqlite');

const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;
let backend;

try {
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  backend = 'better-sqlite3';
} catch (err) {
  // Fall back to the Node built-in driver via a compatibility shim.
  const { DatabaseSync } = require('node:sqlite');
  const inner = new DatabaseSync(dbPath);
  db = createBetterSqliteShim(inner);
  backend = 'node:sqlite (compatibility shim)';
}

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.__backend = backend;
module.exports = db;

// ---------------------------------------------------------------------------
// Compatibility shim: wraps a node:sqlite DatabaseSync instance so it exposes
// the same surface as a better-sqlite3 Database (prepare/exec/pragma/transaction).
// ---------------------------------------------------------------------------
function createBetterSqliteShim(inner) {
  function wrapStatement(sql) {
    const stmt = inner.prepare(sql);
    return {
      get: (...params) => stmt.get(...normalize(params)),
      all: (...params) => stmt.all(...normalize(params)),
      run: (...params) => {
        const info = stmt.run(...normalize(params));
        return {
          changes: Number(info.changes),
          lastInsertRowid: Number(info.lastInsertRowid),
        };
      },
    };
  }

  // node:sqlite binds JS values directly but is strict about undefined —
  // coerce undefined to null so optional columns behave like better-sqlite3.
  function normalize(params) {
    return params.map((p) => (p === undefined ? null : p));
  }

  return {
    prepare: wrapStatement,
    exec: (sql) => inner.exec(sql),
    pragma: (str) => inner.exec(`PRAGMA ${str};`),
    transaction: (fn) => {
      return (...args) => {
        inner.exec('BEGIN');
        try {
          const result = fn(...args);
          inner.exec('COMMIT');
          return result;
        } catch (e) {
          inner.exec('ROLLBACK');
          throw e;
        }
      };
    },
    close: () => inner.close(),
  };
}
