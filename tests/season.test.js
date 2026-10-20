const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');
const D = require('../js/data.js');

test('seasons are 35-day blocks starting from launch', () => {
  const s1 = L.seasonFor('2026-10-19');
  assert.deepEqual([s1.number, s1.startKey, s1.endKey, s1.daysLeft], [1, '2026-10-19', '2026-11-22', 35]);
  const s2 = L.seasonFor('2026-11-23');
  assert.equal(s2.number, 2);
  assert.equal(s2.startKey, '2026-11-23');
  assert.equal(L.seasonFor('2026-11-22').daysLeft, 1);
  assert.equal(L.seasonFor('2026-10-01').number, 1); // before launch still maps to season 1
});

test('season XP only counts check-ins inside the range', () => {
  const c = { '2026-02-08': { xp: 50 }, '2026-02-09': { xp: 20 }, '2026-02-10': { xp: 25 } };
  assert.equal(L.xpBetween(c, '2026-02-09', '2026-03-15'), 45);
});

test('tiers cap at MAX_TIER', () => {
  assert.equal(L.tierFor(0).tier, 0);
  assert.equal(L.tierFor(L.XP_PER_TIER * 3 + 5).tier, 3);
  assert.equal(L.tierFor(L.XP_PER_TIER * 3 + 5).into, 5);
  assert.equal(L.tierFor(99999).tier, L.MAX_TIER);
});

test('pass reward tracks cover every tier', () => {
  assert.equal(D.PASS_FREE.length, L.MAX_TIER);
  assert.equal(D.PASS_PREMIUM.length, L.MAX_TIER);
  const ids = new Set(D.ITEMS.concat(D.ACCESSORIES).map((i) => i.id));
  D.PASS_FREE.concat(D.PASS_PREMIUM).forEach((r) => {
    if (r.item) assert.ok(ids.has(r.item), r.item);
  });
});

test('league ranks by average XP and only counts the user when opted in', () => {
  const schools = D.SCHOOLS.filter((s) => s.id !== 'other');
  const today = '2026-10-21';
  const off = L.schoolLeague(schools, 'chula', 500, false, today);
  const on = L.schoolLeague(schools, 'chula', 500, true, today);
  assert.equal(off.length, schools.length);
  assert.deepEqual(off.map((r) => r.rank), off.map((_, i) => i + 1));
  for (let i = 1; i < off.length; i++) assert.ok(off[i - 1].avg >= off[i].avg);
  const a = off.find((r) => r.mine);
  const b = on.find((r) => r.mine);
  assert.equal(b.members, a.members + 1);
  assert.equal(b.total, a.total + 500);
});

test('achievements unlock from stats', () => {
  const earned = L.achievementsEarned(D.ACHIEVEMENTS, { total: 10, bestStreak: 7, partial: 0 });
  assert.ok(earned.includes('ach-first'));
  assert.ok(earned.includes('ach-streak7'));
  assert.ok(earned.includes('ach-total10'));
  assert.ok(!earned.includes('ach-streak14'));
  assert.ok(!earned.includes('ach-small'));
});

test('packs are deterministic and only contain known cards', () => {
  const a = L.openPack(D.PHOTOCARDS, 'seed', 3);
  assert.deepEqual(a, L.openPack(D.PHOTOCARDS, 'seed', 3));
  assert.equal(a.length, 3);
  const ids = new Set(D.PHOTOCARDS.map((c) => c.id));
  a.forEach((id) => assert.ok(ids.has(id)));
  // Over many packs, commons outnumber epics.
  const many = L.openPack(D.PHOTOCARDS, 'bulk', 3000);
  const rarity = (id) => D.PHOTOCARDS.find((c) => c.id === id).rarity;
  assert.ok(many.filter((id) => rarity(id) === 'common').length > many.filter((id) => rarity(id) === 'epic').length * 3);
});
