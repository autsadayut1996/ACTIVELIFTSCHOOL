const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/index.js');

let app;
let base;

test.before(async () => {
  app = createApp({ dbPath: ':memory:', devTime: true, authLimit: 1000 });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + app.server.address().port;
});

test.after(() => app.server.close());

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    /* static file */
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function act(token, action, args) {
  const r = await call('POST', '/api/action', { action, args }, token);
  return r;
}

const profile = (nickname, schoolId, extra) =>
  Object.assign({ nickname, avatar: '🐻', schoolId, interests: ['badminton'], minutes: 15, daysPerWeek: 4, level: 'new', freeTime: 'evening' }, extra);

async function user(username, schoolId, extra) {
  const r = await call('POST', '/api/register', { username, password: 'password123' });
  assert.equal(r.status, 200, r.text);
  const token = r.json.token;
  const o = await act(token, 'onboard', { profile: profile(username, schoolId, extra) });
  assert.equal(o.status, 200, o.text);
  return { token, id: app.database.prepare('SELECT id FROM users WHERE username = ?').get(username).id };
}

// Directly edit a player's stored state (test setup only).
function patchPlayer(id, fn) {
  const row = app.game.row(id);
  const p = app.game.player(row);
  fn(p);
  app.game.save(id, p);
}

const U = {};

test('registration validates input and rejects duplicates', async () => {
  assert.equal((await call('POST', '/api/register', { username: 'ab', password: 'password123' })).status, 400);
  assert.equal((await call('POST', '/api/register', { username: 'okname', password: 'short' })).status, 400);
  U.a = await user('aom', 'chula');
  assert.equal((await call('POST', '/api/register', { username: 'AOM', password: 'password123' })).status, 409);
  U.b = await user('bank', 'chula');
  U.c = await user('cream', 'chula');
  U.d = await user('dan', 'cmu');
  U.e = await user('earth', 'chula');
});

test('login, me and logout', async () => {
  assert.equal((await call('POST', '/api/login', { username: 'aom', password: 'wrong-pass' })).status, 401);
  const r = await call('POST', '/api/login', { username: 'aom', password: 'password123' });
  assert.equal(r.status, 200);
  const me = await call('GET', '/api/me', null, r.json.token);
  assert.equal(me.json.snapshot.player.profile.nickname, 'aom');
  assert.match(me.json.snapshot.today, /^\d{4}-\d{2}-\d{2}$/);
  await call('POST', '/api/logout', null, r.json.token);
  assert.equal((await call('GET', '/api/me', null, r.json.token)).status, 401);
  assert.equal((await call('GET', '/api/me')).status, 401);
});

test('check-in is computed on the server and only once per day', async () => {
  const r = await act(U.a.token, 'checkin', { activity: 'badminton', kind: 'full' });
  assert.equal(r.status, 200);
  assert.equal(r.json.snapshot.player.xp, 20);
  assert.equal(r.json.snapshot.player.coins, 40);
  assert.equal((await act(U.a.token, 'checkin', { activity: 'badminton' })).status, 400);
  assert.equal((await act(U.a.token, 'checkin', { activity: 'not-a-sport' })).status, 400);
  assert.equal((await act(U.a.token, 'no-such-action')).status, 400);
});

test('close-friends group with real members and privacy', async () => {
  const g = await act(U.a.token, 'create-group', { name: 'แก๊งทดสอบ' });
  assert.equal(g.status, 200);
  const code = g.json.result.code;
  assert.match(code, /^AL-[A-Z0-9]{6}$/);
  assert.equal((await act(U.b.token, 'join-group', { code: code.toLowerCase() })).status, 200);
  assert.equal((await act(U.c.token, 'join-group', { code })).status, 200);
  assert.equal((await act(U.c.token, 'join-group', { code })).status, 400);
  assert.equal((await act(U.d.token, 'join-group', { code: 'AL-NOPE00' })).status, 400);

  await act(U.b.token, 'checkin', { activity: 'walk' });
  const snap = (await call('GET', '/api/me', null, U.a.token)).json.snapshot;
  const group = snap.social.group;
  assert.equal(group.members.length, 2);
  assert.equal(group.total, 3);
  assert.equal(group.countsToday, true); // aom + bank checked in, need 2 of 3
  // Members are still in invisible mode, so progress and rooms stay hidden.
  assert.equal(group.members[0].streak, null);
  assert.equal(group.members[0].room, null);

  await act(U.b.token, 'visibility', { value: 'friends' });
  const again = (await call('GET', '/api/me', null, U.a.token)).json.snapshot.social.group;
  const bank = again.members.find((m) => m.name === 'bank');
  assert.equal(bank.streak, 1);
  assert.ok(bank.room);
});

test('cheers: preset messages to friends only', async () => {
  const ok = await act(U.a.token, 'cheer', { to: U.b.id, message: 'สู้ๆ นะ 💪' });
  assert.equal(ok.status, 200);
  assert.equal((await act(U.a.token, 'cheer', { to: U.b.id, message: 'custom text' })).status, 400);
  assert.equal((await act(U.a.token, 'cheer', { to: U.d.id, message: 'สู้ๆ นะ 💪' })).status, 400);
  const inbox = (await call('GET', '/api/me', null, U.b.token)).json.snapshot.social.cheers;
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].name, 'aom');
  const read = await act(U.b.token, 'cheers-read');
  assert.equal(read.json.snapshot.social.cheers.length, 0);
});

test('buddy matching: opt-in, same school, request, trial, link', async () => {
  // Nobody else is looking yet.
  assert.equal((await act(U.e.token, 'buddy-find')).json.result.candidates.length, 0);
  // aom opts in; dan (other school) opts in too but must not be matched.
  await act(U.a.token, 'buddy-find');
  await act(U.d.token, 'buddy-find');
  const found = (await act(U.e.token, 'buddy-find')).json.result.candidates;
  assert.deepEqual(found.map((c) => c.name), ['aom']);
  assert.equal((await act(U.e.token, 'buddy-request', { to: U.d.id })).status, 400);
  assert.equal((await act(U.e.token, 'buddy-request', { to: U.a.id })).status, 200);

  const pending = (await call('GET', '/api/me', null, U.a.token)).json.snapshot.social;
  assert.equal(pending.buddy.status, 'pending_in');
  assert.equal(pending.buddyRequests.length, 1);

  const accepted = await act(U.a.token, 'buddy-respond', { accept: true });
  assert.equal(accepted.json.snapshot.social.buddy.status, 'trial');
  assert.equal(accepted.json.snapshot.player.lookingForBuddy, false);
  // Buddies see each other's progress even in invisible mode.
  assert.notEqual(accepted.json.snapshot.social.buddy.streak, null);
  assert.equal((await act(U.a.token, 'buddy-link')).status, 400);

  for (let i = 0; i < 3; i++) {
    await act(U.a.token, 'next-day');
    await act(U.e.token, 'next-day');
  }
  assert.equal((await act(U.a.token, 'buddy-link')).json.result.linked, false);
  assert.equal((await act(U.e.token, 'buddy-link')).json.result.linked, true);
  const linked = (await call('GET', '/api/me', null, U.a.token)).json.snapshot.social.buddy;
  assert.equal(linked.status, 'linked');
  // A buddy is a friend for cheers.
  assert.equal((await act(U.a.token, 'cheer', { to: U.e.id, message: 'เก่งมากกก 🎉' })).status, 200);
});

test('report ends the buddy and blocks future contact', async () => {
  const r = await act(U.e.token, 'buddy-report');
  assert.equal(r.status, 200);
  assert.equal(r.json.snapshot.social.buddy, null);
  assert.equal((await act(U.a.token, 'cheer', { to: U.e.id, message: 'สู้ๆ นะ 💪' })).status, 400);
  await act(U.a.token, 'buddy-find');
  const found = (await act(U.e.token, 'buddy-find')).json.result.candidates;
  assert.ok(!found.some((c) => c.name === 'aom'));
});

test('School League counts only opted-in members, by average', async () => {
  let league = (await call('GET', '/api/me', null, U.a.token)).json.snapshot.league;
  assert.equal(league.find((r) => r.id === 'chula').members, 0);
  await act(U.a.token, 'visibility', { value: 'school' });
  await act(U.a.token, 'checkin', { activity: 'walk' });
  const snap = (await call('GET', '/api/me', null, U.a.token)).json.snapshot;
  league = snap.league;
  const chula = league.find((r) => r.id === 'chula');
  assert.equal(chula.members, 1);
  assert.equal(chula.rank, 1);
  assert.ok(chula.mine);
  assert.equal(chula.avg, chula.total);
  assert.ok(snap.tournament.tour);
});

test('card trades swap duplicates between friends', async () => {
  patchPlayer(U.a.id, (p) => (p.cards['pc-dog-run'] = 2));
  patchPlayer(U.b.id, (p) => (p.cards['pc-cat-yoga'] = 3));
  assert.equal((await act(U.a.token, 'trade-offer', { to: U.b.id, card: 'pc-cat-yoga' })).status, 400);
  assert.equal((await act(U.a.token, 'trade-offer', { to: U.d.id, card: 'pc-dog-run' })).status, 400);
  assert.equal((await act(U.a.token, 'trade-offer', { to: U.b.id, card: 'pc-dog-run' })).status, 200);
  const offers = (await call('GET', '/api/me', null, U.b.token)).json.snapshot.social.tradeOffers;
  assert.equal(offers.length, 1);
  const done = await act(U.b.token, 'trade-respond', { offerId: offers[0].id, card: 'pc-cat-yoga' });
  assert.equal(done.status, 200, done.text);
  assert.equal(done.json.snapshot.player.cards['pc-dog-run'], 1);
  assert.equal(done.json.snapshot.player.cards['pc-cat-yoga'], 2);
  const a = (await call('GET', '/api/me', null, U.a.token)).json.snapshot.player.cards;
  assert.equal(a['pc-dog-run'], 1);
  assert.equal(a['pc-cat-yoga'], 1);
});

test('coupons: server-issued unique codes, one per week', async () => {
  patchPlayer(U.c.id, (p) => (p.coins = 10));
  assert.equal((await act(U.c.token, 'redeem', { partnerId: 'smoothie' })).status, 400);
  patchPlayer(U.c.id, (p) => (p.coins = 500));
  const r = await act(U.c.token, 'redeem', { partnerId: 'smoothie', code: 'AL000000' });
  assert.equal(r.status, 200);
  const code = r.json.result.coupon.code;
  assert.notEqual(code, 'AL000000'); // client cannot choose the code
  assert.equal(r.json.snapshot.player.coins, 420);
  assert.equal((await act(U.c.token, 'redeem', { partnerId: 'cafe' })).status, 400);
  assert.equal((await act(U.c.token, 'use-coupon', { code })).status, 200);
  assert.equal((await act(U.c.token, 'use-coupon', { code })).status, 400);
  assert.equal(app.database.prepare('SELECT used_key FROM coupons WHERE code = ?').get(code).used_key !== null, true);
});

test('battle pass claims are validated server-side', async () => {
  assert.equal((await act(U.c.token, 'claim', { keys: [['free', 5]] })).status, 400);
  assert.equal((await act(U.c.token, 'buy', { id: 's1-teddy' })).status, 400); // season items are not for sale
});

test('static files are served, server code is not', async () => {
  const home = await call('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.text, /ActiveLift School/);
  assert.ok(home.headers.get('content-security-policy'));
  assert.equal((await call('GET', '/js/engine.js')).status, 200);
  assert.equal((await call('GET', '/landing/')).status, 200);
  assert.equal((await call('GET', '/server/game.js')).status, 404);
  assert.equal((await call('GET', '/package.json')).status, 404);
  assert.equal((await call('GET', '/js/../server/auth.js')).status, 404);
});

test('export and account deletion', async () => {
  const ex = await call('GET', '/api/export', null, U.b.token);
  assert.equal(ex.json.username, 'bank');
  assert.ok(ex.json.player);
  assert.equal((await call('POST', '/api/delete-account', { password: 'nope-nope' }, U.b.token)).status, 401);
  assert.equal((await call('POST', '/api/delete-account', { password: 'password123' }, U.b.token)).status, 200);
  assert.equal((await call('GET', '/api/me', null, U.b.token)).status, 401);
  const group = (await call('GET', '/api/me', null, U.a.token)).json.snapshot.social.group;
  assert.equal(group.members.length, 1);
});
