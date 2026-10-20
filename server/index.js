// ActiveLift School API + static file server. Run: npm run server
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db.js');
const auth = require('./auth.js');
const { Game, EngineError } = require('./game.js');

const ROOT = path.resolve(__dirname, '..');
const STATIC_PREFIXES = ['/css/', '/js/', '/landing/'];
const MAX_BODY = 32 * 1024;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
    "frame-ancestors 'none'",
  ].join('; '),
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, headers) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({}, SECURITY_HEADERS, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'ข้อมูลใหญ่เกินไป'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(new HttpError(400, 'รูปแบบข้อมูลไม่ถูกต้อง'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const allowed = urlPath === '/index.html' || STATIC_PREFIXES.some((p) => urlPath.startsWith(p));
  const file = path.resolve(ROOT, '.' + urlPath);
  if (!allowed || !file.startsWith(ROOT + path.sep)) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    send(res, 200, data, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  });
}

function createApp(opts) {
  const options = Object.assign({ dbPath: path.join(__dirname, 'data', 'activelift.db'), devTime: false }, opts);
  const database = db.open(options.dbPath);
  const game = new Game(database, { devTime: options.devTime, now: options.now });
  const authLimit = auth.rateLimiter(options.authLimit || 20, 15 * 60000);

  function token(req) {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7) : null;
  }

  function requireUser(req) {
    const id = auth.userForToken(database, token(req));
    if (!id) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
    return id;
  }

  function clientKey(req) {
    return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  }

  const routes = {
    'GET /api/health': () => ({ ok: true }),

    'POST /api/register': async (req) => {
      if (!authLimit(clientKey(req))) throw new HttpError(429, 'ลองบ่อยเกินไป รอสักครู่นะ');
      const body = await readJson(req);
      const c = auth.validateCredentials(body.username, body.password);
      if (c.error) throw new HttpError(400, c.error);
      if (database.prepare('SELECT 1 FROM users WHERE username = ?').get(c.username)) throw new HttpError(409, 'ชื่อผู้ใช้นี้มีคนใช้แล้ว');
      const id = game.createUser(c.username, auth.hashPassword(c.password));
      return { token: auth.createSession(database, id), snapshot: game.snapshot(id) };
    },

    'POST /api/login': async (req) => {
      if (!authLimit(clientKey(req))) throw new HttpError(429, 'ลองบ่อยเกินไป รอสักครู่นะ');
      const body = await readJson(req);
      const username = String(body.username || '').trim().toLowerCase();
      const row = database.prepare('SELECT id, pass_hash FROM users WHERE username = ?').get(username);
      if (!row || !auth.verifyPassword(String(body.password || ''), row.pass_hash)) throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      return { token: auth.createSession(database, row.id), snapshot: game.snapshot(row.id) };
    },

    'POST /api/logout': (req) => {
      auth.destroySession(database, token(req));
      return { ok: true };
    },

    'GET /api/me': (req) => ({ snapshot: game.snapshot(requireUser(req)) }),

    'POST /api/action': async (req) => {
      const id = requireUser(req);
      const body = await readJson(req);
      if (typeof body.action !== 'string') throw new HttpError(400, 'ไม่มีคำสั่ง');
      return game.action(id, body.action, body.args && typeof body.args === 'object' ? body.args : {});
    },

    // Lets a user download everything stored about them (PDPA right of access).
    'GET /api/export': (req) => {
      const id = requireUser(req);
      const row = game.row(id);
      const q = (sql) => database.prepare(sql).all(id, id).map((r) => Object.assign({}, r));
      return {
        username: row.username,
        createdAt: row.created_at,
        player: game.player(row),
        cheers: q('SELECT from_id, to_id, message, day FROM cheers WHERE from_id = ? OR to_id = ?'),
        buddies: q('SELECT from_id, to_id, status, start_key FROM buddies WHERE from_id = ? OR to_id = ?'),
        trades: q('SELECT from_id, to_id, give_card, back_card, status FROM trades WHERE from_id = ? OR to_id = ?'),
      };
    },

    'POST /api/delete-account': async (req) => {
      const id = requireUser(req);
      const body = await readJson(req);
      const row = game.row(id);
      if (!auth.verifyPassword(String(body.password || ''), row.pass_hash)) throw new HttpError(401, 'รหัสผ่านไม่ถูกต้อง');
      game.deleteUser(id);
      return { ok: true };
    },
  };

  async function handle(req, res) {
    const pathname = new URL(req.url, 'http://x').pathname;
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
      return serveStatic(req, res);
    }
    const route = routes[req.method + ' ' + pathname];
    if (!route) return send(res, 404, { error: 'ไม่พบ API นี้' });
    try {
      send(res, 200, await route(req));
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      if (e instanceof EngineError) return send(res, 400, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้งนะ' });
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: 'เกิดข้อผิดพลาด' });
    });
  });
  return { server, database, game };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '0.0.0.0';
  const { server } = createApp({ dbPath: process.env.DB_PATH || undefined, devTime: process.env.DEV_TIME_TRAVEL === '1' });
  server.listen(port, host, () => {
    console.log(`ActiveLift School server on http://localhost:${port} (dev time travel ${process.env.DEV_TIME_TRAVEL === '1' ? 'on' : 'off'})`);
  });
}

module.exports = { createApp };
