// Pure game logic: dates, streaks, XP, levels and simulated friends.
// No DOM access here so it can be tested with `node --test`.
(function (root) {
  'use strict';

  const FREEZES_PER_WEEK = 2;
  const INVISIBLE_DAYS = 14;
  const BUDDY_TRIAL_DAYS = 3;
  const XP_PER_LEVEL = 100;

  // ---- dates (keys are 'YYYY-MM-DD', handled in UTC to avoid timezone drift) ----

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function keyFromLocalDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function keyFromUtc(ms) {
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function addDays(key, n) {
    return keyFromUtc(parseKey(key) + n * 86400000);
  }

  function diffDays(fromKey, toKey) {
    return Math.round((parseKey(toKey) - parseKey(fromKey)) / 86400000);
  }

  // Monday of the week containing `key`, used to budget streak freezes per week.
  function weekKey(key) {
    const dow = new Date(parseKey(key)).getUTCDay(); // 0 = Sunday
    return addDays(key, -((dow + 6) % 7));
  }

  // ---- streaks ----

  // Walks back from today. Missed days are covered by up to FREEZES_PER_WEEK
  // freezes per calendar week; today never counts as missed (there is still time).
  function computeStreak(checkins, today, start) {
    const checkedToday = Boolean(checkins[today]);
    let day = checkedToday ? today : addDays(today, -1);
    let count = 0;
    let oldestChecked = null;
    const frozen = [];
    const weekUse = {};

    while (day >= start) {
      if (checkins[day]) {
        count++;
        oldestChecked = day;
      } else {
        const wk = weekKey(day);
        if ((weekUse[wk] || 0) >= FREEZES_PER_WEEK) break;
        weekUse[wk] = (weekUse[wk] || 0) + 1;
        frozen.push(day);
      }
      day = addDays(day, -1);
    }

    // Misses older than the first check-in of the run are not part of it.
    const frozenInRun = oldestChecked ? frozen.filter((k) => k > oldestChecked) : [];
    const thisWeek = weekKey(today);
    const usedThisWeek = frozenInRun.filter((k) => weekKey(k) === thisWeek).length;

    return {
      count,
      checkedToday,
      frozenDays: frozenInRun,
      freezesLeftThisWeek: FREEZES_PER_WEEK - usedThisWeek,
    };
  }

  // ---- XP & levels (rewards consistency, never body metrics) ----

  function rewardFor(kind, streakBefore) {
    const base = kind === 'full' ? 20 : 10;
    const streakBonus = Math.min(streakBefore, 5) * 5;
    return { xp: base + streakBonus, coins: kind === 'full' ? 10 : 6 };
  }

  const LEVEL_TITLES = [
    'มือใหม่หัดขยับ',
    'นักขยับตัวยง',
    'สายชิลสม่ำเสมอ',
    'ตัวตึงประจำห้อง',
    'ฮีโร่ของแก๊ง',
    'ตำนานประจำโรงเรียน',
  ];

  function levelFor(xp) {
    const level = Math.floor(xp / XP_PER_LEVEL) + 1;
    return {
      level,
      into: xp % XP_PER_LEVEL,
      need: XP_PER_LEVEL,
      title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    };
  }

  // ---- privacy ----

  function invisibleDaysLeft(invisibleUntil, today) {
    return Math.max(0, diffDays(today, invisibleUntil));
  }

  // ---- simulated friends (deterministic so the prototype feels stable) ----

  function seededRandom(str) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    return (h1 >>> 0) / 4294967296;
  }

  function mockChecked(person, key) {
    return seededRandom(person.name + '|' + key) < person.rate;
  }

  function mockCheckins(person, today, days) {
    const out = {};
    for (let i = 0; i < days; i++) {
      const k = addDays(today, -i);
      if (mockChecked(person, k)) out[k] = { kind: 'full' };
    }
    return out;
  }

  function mockStreak(person, today) {
    return computeStreak(mockCheckins(person, today, 60), today, addDays(today, -59)).count;
  }

  // A group day counts when at least half the members checked in.
  function groupStreak(userCheckins, members, createdKey, today) {
    const total = members.length + 1;
    const need = Math.ceil(total / 2);
    const dayCounts = (k) =>
      (userCheckins[k] ? 1 : 0) + members.filter((m) => mockChecked(m, k)).length >= need;

    const countsToday = dayCounts(today);
    let day = countsToday ? today : addDays(today, -1);
    let count = 0;
    while (day >= createdKey && dayCounts(day)) {
      count++;
      day = addDays(day, -1);
    }
    return { count, countsToday, need, total };
  }

  // Match on activity level, free time and interests — never on appearance.
  function buddyScore(profile, candidate) {
    let score = 0;
    const reasons = [];
    if (candidate.level === profile.level) {
      score += 2;
      reasons.push('ระดับการขยับใกล้กัน');
    }
    if (candidate.freeTime === profile.freeTime) {
      score += 2;
      reasons.push('ว่างช่วงเวลาเดียวกัน');
    }
    const shared = candidate.interests.filter((i) => profile.interests.includes(i));
    score += shared.length;
    return { score, reasons, shared };
  }

  // ---- Battle Pass seasons (global 35-day blocks so every school shares a season) ----

  const SEASON_EPOCH = '2026-10-19'; // launch Monday of season 1
  const SEASON_DAYS = 35;
  const XP_PER_TIER = 80; // ~5 check-ins a week reaches the last tier by season end
  const MAX_TIER = 12;

  function seasonFor(today) {
    const index = Math.max(0, Math.floor(diffDays(SEASON_EPOCH, today) / SEASON_DAYS));
    const startKey = addDays(SEASON_EPOCH, index * SEASON_DAYS);
    const endKey = addDays(startKey, SEASON_DAYS - 1);
    return { number: index + 1, startKey, endKey, daysLeft: diffDays(today, endKey) + 1 };
  }

  function xpBetween(checkins, fromKey, toKey) {
    return Object.keys(checkins)
      .filter((k) => k >= fromKey && k <= toKey)
      .reduce((sum, k) => sum + (checkins[k].xp || 0), 0);
  }

  function tierFor(seasonXp) {
    const tier = Math.min(MAX_TIER, Math.floor(seasonXp / XP_PER_TIER));
    return { tier, into: tier === MAX_TIER ? XP_PER_TIER : seasonXp % XP_PER_TIER, need: XP_PER_TIER };
  }

  // ---- School League: ranked by average weekly XP per active member, so small schools can win ----

  function schoolWeek(school, week, dayOfWeek) {
    const members = 30 + Math.floor(seededRandom(school.id + '|members') * 370);
    const pace = 25 + seededRandom(school.id + '|' + week) * 20; // avg XP per member per day
    return { members, total: Math.round(members * pace * (dayOfWeek + 1)) };
  }

  function schoolLeague(schools, mySchoolId, myWeekXp, counted, today) {
    const week = weekKey(today);
    const dayOfWeek = diffDays(week, today);
    return schools
      .map((s) => {
        const w = schoolWeek(s, week, dayOfWeek);
        const mine = s.id === mySchoolId && counted;
        const members = w.members + (mine ? 1 : 0);
        const total = w.total + (mine ? myWeekXp : 0);
        return { id: s.id, name: s.name, members, total, avg: Math.round(total / members), mine: s.id === mySchoolId };
      })
      .sort((a, b) => b.avg - a.avg)
      .map((row, i) => Object.assign(row, { rank: i + 1 }));
  }

  // ---- Collectible cards ----

  // `need` maps a stat name to the minimum value required.
  function achievementsEarned(defs, stats) {
    return defs.filter((d) => Object.keys(d.need).every((k) => (stats[k] || 0) >= d.need[k])).map((d) => d.id);
  }

  // Deterministic pack: rarer cards are less likely.
  const RARITY_WEIGHT = { common: 6, rare: 3, epic: 1 };

  function openPack(cards, seed, size) {
    const pool = [];
    cards.forEach((c) => {
      for (let i = 0; i < RARITY_WEIGHT[c.rarity]; i++) pool.push(c.id);
    });
    return Array.from({ length: size }, (_, i) => pool[Math.floor(seededRandom(seed + '#' + i) * pool.length)]);
  }

  const api = {
    FREEZES_PER_WEEK,
    SEASON_DAYS,
    XP_PER_TIER,
    MAX_TIER,
    seasonFor,
    xpBetween,
    tierFor,
    schoolLeague,
    achievementsEarned,
    openPack,
    INVISIBLE_DAYS,
    BUDDY_TRIAL_DAYS,
    keyFromLocalDate,
    addDays,
    diffDays,
    weekKey,
    computeStreak,
    rewardFor,
    levelFor,
    invisibleDaysLeft,
    seededRandom,
    mockChecked,
    mockStreak,
    groupStreak,
    buddyScore,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(this);
