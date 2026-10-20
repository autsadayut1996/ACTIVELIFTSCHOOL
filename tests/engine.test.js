const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const L = require('../js/logic.js');

const DAY = '2026-10-21';
const profile = { nickname: ' มายด์ ', avatar: '🐰', schoolId: 'chula', interests: ['dance', 'nope'], minutes: 15, daysPerWeek: 4 };

function onboarded() {
  const p = E.freshPlayer();
  E.ACTIONS.onboard(p, DAY, { profile });
  return p;
}

test('profile is cleaned and validated', () => {
  const p = onboarded();
  assert.equal(p.profile.nickname, 'มายด์');
  assert.deepEqual(p.profile.interests, ['dance']);
  assert.equal(p.invisibleUntil, L.addDays(DAY, L.INVISIBLE_DAYS));
  assert.throws(() => E.cleanProfile({ nickname: '', schoolId: 'chula', interests: ['dance'] }), E.EngineError);
  assert.throws(() => E.cleanProfile({ nickname: 'a', schoolId: 'other', interests: ['dance'] }), /ชื่อสถาบัน/);
  assert.equal(E.cleanProfile({ nickname: '<b>x</b>', schoolId: 'tu', interests: ['walk'] }).nickname, 'bx/b');
  assert.throws(() => E.ACTIONS.onboard(p, DAY, { profile }), /ไปแล้ว/);
});

test('check-in rewards and validation', () => {
  const p = onboarded();
  const r = E.ACTIONS.checkin(p, DAY, { activity: 'dance', kind: 'partial', mood: 'bad-mood' });
  assert.equal(r.reward.xp, 10);
  assert.equal(p.checkins[DAY].mood, null);
  assert.throws(() => E.ACTIONS.checkin(p, DAY, { activity: 'dance' }), /เช็คอินไปแล้ว/);
  assert.throws(() => E.ACTIONS.checkin(p, L.addDays(DAY, 1), { activity: 'flying' }), E.EngineError);
});

test('shop rules: no buying season or streak items, coins required', () => {
  const p = onboarded();
  assert.throws(() => E.ACTIONS.buy(p, DAY, { id: 's1-teddy' }), E.EngineError);
  assert.throws(() => E.ACTIONS.buy(p, DAY, { id: 'trophy' }), E.EngineError);
  assert.throws(() => E.ACTIONS.buy(p, DAY, { id: 'theme-night' }), /เหรียญ/);
  E.ACTIONS.buy(p, DAY, { id: 'plant' });
  assert.ok(p.placed.includes('plant'));
  assert.equal(p.coins, 10);
  assert.throws(() => E.ACTIONS['toggle-item'](p, DAY, { id: 'cat' }), E.EngineError);
});

test('pass claims need the tier and premium', () => {
  const p = onboarded();
  assert.throws(() => E.ACTIONS.claim(p, DAY, { keys: [['free', 0]] }), /tier/);
  p.checkins[DAY] = { xp: L.XP_PER_TIER * 2 };
  const r = E.ACTIONS.claim(p, DAY, { keys: [['free', 0], ['free', 0]] });
  assert.deepEqual(r.labels, ['🪙 20']);
  assert.throws(() => E.ACTIONS.claim(p, DAY, { keys: [['premium', 0]] }), /Premium/);
  E.ACTIONS['unlock-premium'](p, DAY);
  assert.equal(E.ACTIONS['claim-all'](p, DAY).labels.length, 3);
});

test('refresh asks the exit survey once and awards cards', () => {
  const p = onboarded();
  E.ACTIONS.checkin(p, DAY, { activity: 'dance' });
  E.ACTIONS.checkin(p, L.addDays(DAY, 1), { activity: 'walk' });
  let ev = E.refresh(p, L.addDays(DAY, 1), {});
  assert.ok(ev.newCards.includes('ach-first'));
  assert.equal(ev.askSurvey, null);
  // Three missed days in one week (Thu-Sat after Tue/Wed check-ins) break the streak.
  ev = E.refresh(p, L.addDays(DAY, 6), {});
  assert.equal(ev.askSurvey, 2);
  assert.equal(E.refresh(p, L.addDays(DAY, 6), {}).askSurvey, null);
  E.ACTIONS.survey(p, DAY, { reason: 'ไม่ค่อยสบาย' });
  assert.equal(p.surveys[0].reason, 'ไม่ค่อยสบาย');
  assert.throws(() => E.ACTIONS.survey(p, DAY, { reason: 'made up' }), E.EngineError);
});

test('old saves are upgraded', () => {
  const p = E.upgrade({ profile: { nickname: 'old' }, startKey: DAY, checkins: {}, xp: 5 });
  assert.equal(p.onboarded, true);
  assert.equal(p.xp, 5);
  assert.ok(p.fakeDoor);
  assert.ok(p.seed);
});
