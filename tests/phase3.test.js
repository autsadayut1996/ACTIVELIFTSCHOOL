const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');
const D = require('../js/data.js');

const SEASON1 = '2026-10-19';

test('tournament runs in weeks 2-4 of the season', () => {
  const t = L.tournamentFor(SEASON1);
  assert.equal(t.phase, 'upcoming');
  assert.equal(t.startKey, '2026-10-26');
  assert.deepEqual(t.rounds.map((r) => r.startKey), ['2026-10-26', '2026-11-02', '2026-11-09']);
  assert.equal(L.tournamentFor('2026-11-01').phase, 'live');
  assert.equal(L.tournamentFor('2026-11-16').phase, 'done');
});

test('bracket advances winners and stops at the live round', () => {
  const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const strength = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 };
  const rounds = L.tournamentFor(SEASON1).rounds;
  const score = (id) => strength[id];

  assert.equal(L.bracket(seeds, rounds, SEASON1, score).length, 0);

  const live = L.bracket(seeds, rounds, '2026-11-03', score);
  assert.equal(live.length, 2);
  assert.deepEqual(live[0].matches.map((m) => m.winner), ['b', 'd', 'f', 'h']);
  assert.equal(live[1].finished, false);
  assert.equal(live[1].matches[0].winner, null);

  const done = L.bracket(seeds, rounds, '2026-11-20', score);
  assert.equal(done[2].matches[0].winner, 'h');
  // Ties go to the first seed.
  assert.equal(L.bracket(seeds, rounds, '2026-11-20', () => 1)[2].matches[0].winner, 'a');
});

test('tournament score counts the user only when opted in and active enough', () => {
  const round = L.tournamentFor(SEASON1).rounds[0];
  const day = '2026-11-01';
  const base = L.tournamentScore({ id: 'chula' }, round, day, null);
  const lazy = L.tournamentScore({ id: 'chula' }, round, day, { counted: true, days: 1 });
  const active = L.tournamentScore({ id: 'chula' }, round, day, { counted: true, days: 3 });
  assert.ok(lazy <= base);
  assert.ok(active >= lazy);
  assert.ok(base > 0 && base <= 100);
});

test('tournament schools are all real school ids', () => {
  assert.equal(D.TOURNAMENT_SCHOOLS.length, 8);
  D.TOURNAMENT_SCHOOLS.forEach((id) => assert.ok(D.SCHOOLS.some((s) => s.id === id), id));
});

test('one coupon per week, valid for 7 days', () => {
  const coupons = [{ issuedKey: '2026-10-21', usedKey: null }];
  assert.equal(L.canRedeem([], '2026-10-21'), true);
  assert.equal(L.canRedeem(coupons, '2026-10-25'), false);
  assert.equal(L.canRedeem(coupons, '2026-10-26'), true);
  assert.equal(L.couponStatus(coupons[0], '2026-10-27'), 'active');
  assert.equal(L.couponStatus(coupons[0], '2026-10-28'), 'expired');
  assert.equal(L.couponStatus({ issuedKey: '2026-10-21', usedKey: '2026-10-22' }, '2026-10-22'), 'used');
});
