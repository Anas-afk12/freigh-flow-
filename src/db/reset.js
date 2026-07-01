// Drops the SQLite file entirely and rebuilds schema + seed from scratch.
// Destructive — intended for development only.
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, '..', '..', 'data', 'freightflow.sqlite');

for (const suffix of ['', '-shm', '-wal']) {
  const f = dbPath + suffix;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
console.log('Existing database removed.');

// Require AFTER deletion so the connection recreates a fresh file.
const { seed } = require('./seed');
const result = seed();
console.log(
  result.skipped
    ? 'Reset complete (schema created; seed skipped).'
    : `Reset complete. Sample job EUMEX-2026-001 created (id ${result.jobId}).`
);
