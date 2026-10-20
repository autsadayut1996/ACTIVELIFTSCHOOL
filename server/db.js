// SQLite storage via Node's built-in node:sqlite (no external dependencies).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    player TEXT NOT NULL,            -- engine state (JSON), only changed through server-side actions
    nickname TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    school_id TEXT NOT NULL DEFAULT '',
    school_other TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'self',
    looking_for_buddy INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  -- Mirror of check-in days for cross-user queries (League, tournament, group streaks).
  CREATE TABLE IF NOT EXISTS checkins (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    xp INTEGER NOT NULL,
    PRIMARY KEY (user_id, day)
  );

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_key TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_members (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cheers (
    id INTEGER PRIMARY KEY,
    from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    day TEXT NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0
  );

  -- status: pending -> trial -> linked, or ended at any point.
  CREATE TABLE IF NOT EXISTS buddies (
    id INTEGER PRIMARY KEY,
    from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    start_key TEXT,
    from_link INTEGER NOT NULL DEFAULT 0,
    to_link INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (blocker_id, blocked_id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY,
    reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reported_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    context TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY,
    from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    give_card TEXT NOT NULL,
    back_card TEXT,
    status TEXT NOT NULL             -- pending | done | declined
  );

  -- Coupon codes must be unique across users so partner shops can verify them.
  CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    partner_id TEXT NOT NULL,
    issued_key TEXT NOT NULL,
    used_key TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_checkins_day ON checkins(day);
  CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id, visibility);
  CREATE INDEX IF NOT EXISTS idx_buddies_users ON buddies(from_id, to_id, status);
`;

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

// Runs fn inside a transaction; rolls back if it throws.
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { open, tx };
