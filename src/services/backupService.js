// Local SQLite backup rotation (Improvement #10). The database is a single
// file, so one accidental delete/corruption loses all financial records. This
// copies the DB into data/backups/ with a timestamp and keeps the last 30.
// Invoked by Electron on app close (see main.js) and available via a script.
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const KEEP = 30;

function dbFilePath() {
  return process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.join(__dirname, '..', '..', 'data', 'freightflow.sqlite');
}

function backupDir() {
  return path.join(path.dirname(dbFilePath()), 'backups');
}

function createBackup() {
  const src = dbFilePath();
  if (!fs.existsSync(src)) return null;

  const dir = backupDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `freightflow-${stamp}.sqlite`);
  fs.copyFileSync(src, dest);

  rotate(dir);
  return dest;
}

// Keep only the newest KEEP backups; delete the rest.
function rotate(dir) {
  const backups = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('freightflow-') && f.endsWith('.sqlite'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  for (const old of backups.slice(KEEP)) {
    fs.unlinkSync(path.join(dir, old.f));
  }
}

if (require.main === module) {
  const dest = createBackup();
  console.log(dest ? `Backup created: ${dest}` : 'No database file to back up.');
}

module.exports = { createBackup, backupDir };
