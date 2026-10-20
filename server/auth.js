// Username + password accounts with opaque session tokens. No email or real name is stored.
'use strict';

const crypto = require('node:crypto');

const SESSION_DAYS = 30;
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function validateCredentials(username, password) {
  const u = String(username || '').trim().toLowerCase();
  const pw = String(password || '');
  if (!USERNAME_RE.test(u)) return { error: 'ชื่อผู้ใช้ต้องเป็น a-z, 0-9, _ หรือ . ยาว 3–20 ตัว' };
  if (pw.length < 8 || pw.length > 128) return { error: 'รหัสผ่านต้องยาว 8 ตัวขึ้นไป' };
  return { username: u, password: pw };
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 86400000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  return token;
}

function userForToken(db, token) {
  if (!token) return null;
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(sha256(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return null;
  }
  return row.user_id;
}

function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

// Small in-memory limiter for login/register attempts per client.
function rateLimiter(limit, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    list.push(now);
    hits.set(key, list);
    return list.length <= limit;
  };
}

module.exports = { hashPassword, verifyPassword, validateCredentials, createSession, userForToken, destroySession, rateLimiter };
