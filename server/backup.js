// Consistent SQLite snapshots with VACUUM INTO. CLI: node server/backup.js <db> <dir>
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KEEP = 7;

function backup(db, dir, keep) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `activelift-${stamp}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const old = fs
    .readdirSync(dir)
    .filter((f) => /^activelift-.*\.db$/.test(f))
    .sort()
    .reverse()
    .slice(keep || KEEP);
  old.forEach((f) => fs.unlinkSync(path.join(dir, f)));
  return file;
}

if (require.main === module) {
  const { DatabaseSync } = require('node:sqlite');
  const [dbPath, dir] = process.argv.slice(2);
  if (!dbPath || !dir) {
    console.error('usage: node server/backup.js <db file> <backup dir>');
    process.exit(1);
  }
  console.log(backup(new DatabaseSync(dbPath, { readOnly: true }), dir));
}

module.exports = { backup };
