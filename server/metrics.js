// Aggregated test results for the team (no usernames or other personal data).
'use strict';

const L = require('../js/logic.js');

function pct(n, d) {
  return d ? Math.round((n / d) * 1000) / 10 : null;
}

function tally(list) {
  const out = {};
  list.forEach((k) => {
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function metrics(db, game) {
  const rows = db.prepare('SELECT id, player FROM users').all();
  const players = rows.map((r) => ({ id: r.id, p: game.player(r) }));
  const onboarded = players.filter((x) => x.p.onboarded);

  const activeDays = new Map();
  db.prepare('SELECT user_id, day FROM activity').all().forEach((r) => {
    if (!activeDays.has(r.user_id)) activeDays.set(r.user_id, new Set());
    activeDays.get(r.user_id).add(r.day);
  });
  const activeOn = (id, day) => Boolean(activeDays.get(id) && activeDays.get(id).has(day));
  const activeBetween = (id, from, to) => Array.from(activeDays.get(id) || []).some((d) => d >= from && d <= to);

  // Friends = current group mates plus an accepted buddy.
  const friendsOf = new Map();
  const link = (a, b) => {
    if (!friendsOf.has(a)) friendsOf.set(a, new Set());
    friendsOf.get(a).add(b);
  };
  db.prepare('SELECT a.user_id AS a, b.user_id AS b FROM group_members a JOIN group_members b ON a.group_id = b.group_id AND a.user_id != b.user_id').all().forEach((r) => link(r.a, r.b));
  db.prepare("SELECT from_id, to_id FROM buddies WHERE status IN ('trial', 'linked')").all().forEach((r) => {
    link(r.from_id, r.to_id);
    link(r.to_id, r.from_id);
  });

  // Retention is measured per user from their own start day, only once they could have returned.
  const cohort = { d2: [0, 0], d7: [0, 0], northStar: [0, 0] };
  onboarded.forEach(({ id, p }) => {
    const today = game.today(p);
    const start = p.startKey;
    if (today >= L.addDays(start, 1)) {
      cohort.d2[1]++;
      if (activeOn(id, L.addDays(start, 1))) cohort.d2[0]++;
    }
    if (today >= L.addDays(start, 6)) {
      cohort.d7[1]++;
      if (activeOn(id, L.addDays(start, 6))) cohort.d7[0]++;
    }
    // North Star: back in week 2 together with at least one friend who was also active then.
    if (today >= L.addDays(start, 7)) {
      const from = L.addDays(start, 7);
      const to = L.addDays(start, 13);
      cohort.northStar[1]++;
      const friends = Array.from(friendsOf.get(id) || []);
      if (activeBetween(id, from, to) && friends.some((f) => activeBetween(f, from, to))) cohort.northStar[0]++;
    }
  });

  const checkins = onboarded.flatMap(({ p }) => Object.values(p.checkins));
  const variants = {};
  onboarded.forEach(({ p }) => {
    const v = p.priceVariant || 'not seen';
    const t = (variants[v] = variants[v] || { players: 0, views: 0, buyClicks: 0, parentClicks: 0, premium: 0 });
    t.players++;
    t.views += p.fakeDoor.views;
    t.buyClicks += p.fakeDoor.buyClicks;
    t.parentClicks += p.fakeDoor.parentClicks;
    if (p.pass && p.pass.premium) t.premium++;
  });
  const teacherInvites = {};
  onboarded.forEach(({ p }) => {
    if (p.fakeDoor.teacherInvites) teacherInvites[p.profile.schoolId] = (teacherInvites[p.profile.schoolId] || 0) + p.fakeDoor.teacherInvites;
  });
  const count = (sql) => db.prepare(sql).get().n;

  return {
    generatedAt: new Date().toISOString(),
    users: { registered: rows.length, onboarded: onboarded.length },
    retention: {
      day2: { percent: pct(...cohort.d2), returned: cohort.d2[0], eligible: cohort.d2[1] },
      day7: { percent: pct(...cohort.d7), returned: cohort.d7[0], eligible: cohort.d7[1] },
      northStar: { label: 'กลับมาสัปดาห์ที่ 2 พร้อมเพื่อนอย่างน้อย 1 คน', percent: pct(...cohort.northStar), returned: cohort.northStar[0], eligible: cohort.northStar[1] },
    },
    checkins: {
      total: checkins.length,
      partialPercent: pct(checkins.filter((c) => c.kind === 'partial').length, checkins.length),
      byActivity: tally(checkins.map((c) => c.activity)),
      moods: tally(checkins.map((c) => c.mood || 'none')),
    },
    privacy: { visibility: tally(onboarded.map(({ p }) => p.visibility)) },
    exitSurvey: tally(onboarded.flatMap(({ p }) => p.surveys.map((s) => s.reason || 'skipped'))),
    pricing: variants,
    teacherInvitesBySchool: teacherInvites,
    schools: tally(onboarded.map(({ p }) => p.profile.schoolId)),
    social: {
      groups: count('SELECT COUNT(*) AS n FROM groups'),
      groupMembers: count('SELECT COUNT(*) AS n FROM group_members'),
      buddies: tally(db.prepare('SELECT status FROM buddies').all().map((r) => r.status)),
      cheers: count('SELECT COUNT(*) AS n FROM cheers'),
      tradesDone: count("SELECT COUNT(*) AS n FROM trades WHERE status = 'done'"),
      reports: count('SELECT COUNT(*) AS n FROM reports'),
    },
    coupons: {
      issued: tally(db.prepare('SELECT partner_id FROM coupons').all().map((r) => r.partner_id)),
      used: count('SELECT COUNT(*) AS n FROM coupons WHERE used_key IS NOT NULL'),
    },
  };
}

module.exports = { metrics };
