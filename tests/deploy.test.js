const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/index.js');
const { backup } = require('../server/backup.js');

async function start(opts) {
  const app = createApp(Object.assign({ dbPath: ':memory:' }, opts));
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  app.base = 'http://127.0.0.1:' + app.server.address().port;
  return app;
}

async function call(app, method, p, body, headers) {
  const res = await fetch(app.base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const profile = { nickname: 'mind', avatar: '🐰', schoolId: 'chula', interests: ['dance'] };

test('invite code gates registration', async () => {
  const app = await start({ registrationCode: 'PILOT2026', authLimit: 100 });
  try {
    assert.equal((await call(app, 'GET', '/api/health')).json.inviteRequired, true);
    assert.equal((await call(app, 'POST', '/api/register', { username: 'mind', password: 'password123' })).status, 403);
    assert.equal((await call(app, 'POST', '/api/register', { username: 'mind', password: 'password123', inviteCode: 'WRONG' })).status, 403);
    assert.equal((await call(app, 'POST', '/api/register', { username: 'mind', password: 'password123', inviteCode: ' pilot2026 ' })).status, 200);
  } finally {
    app.server.close();
  }
});

test('rate limit ignores X-Forwarded-For unless behind a trusted proxy', async () => {
  const app = await start({ authLimit: 2 });
  try {
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const r = await call(app, 'POST', '/api/login', { username: 'x', password: 'y' }, { 'X-Forwarded-For': '10.0.0.' + i });
      statuses.push(r.status);
    }
    assert.deepEqual(statuses, [401, 401, 429]);
  } finally {
    app.server.close();
  }
});

test('admin metrics are hidden without the token and report retention', async () => {
  const app = await start({ adminToken: 'secret-token', devTime: true });
  try {
    assert.equal((await call(app, 'GET', '/api/admin/metrics')).status, 404);
    assert.equal((await call(app, 'GET', '/api/admin/metrics', null, { Authorization: 'Bearer nope' })).status, 404);

    const reg = await call(app, 'POST', '/api/register', { username: 'mind', password: 'password123' });
    const auth = { Authorization: 'Bearer ' + reg.json.token };
    await call(app, 'POST', '/api/action', { action: 'onboard', args: { profile } }, auth);
    await call(app, 'POST', '/api/action', { action: 'checkin', args: { activity: 'dance', kind: 'partial' } }, auth);
    await call(app, 'POST', '/api/action', { action: 'next-day' }, auth); // opens the app on day 2

    const m = (await call(app, 'GET', '/api/admin/metrics', null, { Authorization: 'Bearer secret-token' })).json;
    assert.equal(m.users.onboarded, 1);
    assert.deepEqual(m.retention.day2, { percent: 100, returned: 1, eligible: 1 });
    assert.equal(m.retention.day7.eligible, 0);
    assert.equal(m.checkins.total, 1);
    assert.equal(m.checkins.partialPercent, 100);
    assert.equal(m.schools.chula, 1);
    assert.ok(!JSON.stringify(m).includes('mind')); // no usernames or nicknames
  } finally {
    app.server.close();
  }
});

test('admin page is served', async () => {
  const app = await start({});
  try {
    const res = await fetch(app.base + '/admin/');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /ผลการทดสอบ/);
  } finally {
    app.server.close();
  }
});

test('backups are consistent copies and old ones are pruned', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'al-backup-'));
  const app = createApp({ dbPath: path.join(dir, 'live.db') });
  try {
    app.game.createUser('someone', 'x');
    const out = path.join(dir, 'backups');
    const files = [];
    for (let i = 0; i < 4; i++) {
      files.push(backup(app.database, out, 2));
      // Distinct timestamps in file names.
      const until = Date.now() + 5;
      while (Date.now() < until);
    }
    const kept = fs.readdirSync(out);
    assert.equal(kept.length, 2);
    const { DatabaseSync } = require('node:sqlite');
    const copy = new DatabaseSync(files[3], { readOnly: true });
    assert.equal(copy.prepare('SELECT username FROM users').get().username, 'someone');
    copy.close();
  } finally {
    app.database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
