const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

const days = (start, offsets) => Object.fromEntries(offsets.map((o) => [L.addDays(start, o), { kind: 'full' }]));

// 2026-10-19 is a Monday.
const MON = '2026-10-19';

test('weekKey returns the Monday of the week', () => {
  assert.equal(L.weekKey('2026-10-19'), MON);
  assert.equal(L.weekKey('2026-10-25'), MON); // Sunday
  assert.equal(L.weekKey('2026-10-26'), '2026-10-26');
});

test('streak counts consecutive check-ins and today is never a miss', () => {
  const c = days(MON, [0, 1, 2]);
  assert.equal(L.computeStreak(c, L.addDays(MON, 2), MON).count, 3);
  const notYet = L.computeStreak(c, L.addDays(MON, 3), MON);
  assert.equal(notYet.count, 3);
  assert.equal(notYet.checkedToday, false);
  assert.equal(notYet.freezesLeftThisWeek, 2);
});

test('up to two missed days per week are frozen, a third breaks the streak', () => {
  // Mon ✓, Tue ✗, Wed ✓, Thu ✗, Fri ✓ -> two freezes used, streak survives.
  const c = days(MON, [0, 2, 4]);
  const s = L.computeStreak(c, L.addDays(MON, 4), MON);
  assert.equal(s.count, 3);
  assert.deepEqual(s.frozenDays.sort(), [L.addDays(MON, 1), L.addDays(MON, 3)]);
  assert.equal(s.freezesLeftThisWeek, 0);

  // A third miss (Tue, Thu, Sat) breaks it: freezes go to the latest misses, so Monday drops out.
  const c2 = days(MON, [0, 2, 4, 6]);
  const s2 = L.computeStreak(c2, L.addDays(MON, 6), MON);
  assert.equal(s2.count, 3);
  assert.deepEqual(s2.frozenDays.sort(), [L.addDays(MON, 3), L.addDays(MON, 5)]);
});

test('freeze budget resets each week', () => {
  // Two misses in week 1 and two in week 2.
  const c = days(MON, [0, 2, 4, 5, 6, 7, 9, 11]);
  assert.equal(L.computeStreak(c, L.addDays(MON, 11), MON).count, 8);
});

test('misses before the first check-in are not part of the run', () => {
  const start = MON;
  const c = days(MON, [3, 4]);
  const s = L.computeStreak(c, L.addDays(MON, 4), start);
  assert.equal(s.count, 2);
  assert.deepEqual(s.frozenDays, []);
  assert.equal(s.freezesLeftThisWeek, 2);
});

test('no check-ins means zero streak', () => {
  assert.equal(L.computeStreak({}, L.addDays(MON, 3), MON).count, 0);
});

test('rewards favour consistency and partial effort still counts', () => {
  assert.deepEqual(L.rewardFor('full', 0), { xp: 20, coins: 10 });
  assert.deepEqual(L.rewardFor('partial', 0), { xp: 10, coins: 6 });
  assert.equal(L.rewardFor('full', 10).xp, 45); // streak bonus capped at +25
});

test('levels', () => {
  assert.equal(L.levelFor(0).level, 1);
  assert.equal(L.levelFor(250).level, 3);
  assert.equal(L.levelFor(250).into, 50);
  assert.equal(L.levelFor(99999).title, 'ตำนานประจำโรงเรียน');
});

test('invisible mode countdown', () => {
  assert.equal(L.invisibleDaysLeft(L.addDays(MON, 14), MON), 14);
  assert.equal(L.invisibleDaysLeft(MON, L.addDays(MON, 3)), 0);
});

test('group streak needs half the members each day', () => {
  const always = { name: 'a', rate: 1 };
  const never = { name: 'b', rate: 0 };
  const user = days(MON, [0, 1, 2]);
  // 3 people, need 2: user + always-member -> counts.
  assert.equal(L.groupStreak(user, [always, never], MON, L.addDays(MON, 2)).count, 3);
  // User alone with two absent members -> does not count.
  assert.equal(L.groupStreak(user, [never, { name: 'c', rate: 0 }], MON, L.addDays(MON, 2)).count, 0);
});

test('buddy score uses level, free time and interests only', () => {
  const profile = { level: 'new', freeTime: 'evening', interests: ['dance', 'yoga'] };
  const r = L.buddyScore(profile, { level: 'new', freeTime: 'evening', interests: ['dance'] });
  assert.equal(r.score, 5);
  assert.deepEqual(r.shared, ['dance']);
});
