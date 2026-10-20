// Per-player game rules shared by the offline app and the server.
// Every function validates its input and mutates the player object in place.
(function (root) {
  'use strict';

  const L = root.Logic || require('./logic.js');
  const D = root.Data || require('./data.js');

  class EngineError extends Error {}

  function fail(msg) {
    throw new EngineError(msg);
  }

  const byId = (list, id) => list.find((x) => x.id === id);
  const VISIBILITY = ['self', 'friends', 'class', 'school'];
  const MINUTES = [10, 15, 20, 30];

  function freshPlayer() {
    return {
      version: 2,
      onboarded: false,
      seed: Math.random().toString(36).slice(2, 10),
      dayOffset: 0,
      profile: {
        nickname: '',
        avatar: D.AVATARS[0],
        schoolId: '',
        schoolOther: '',
        unit: '',
        interests: [],
        minutes: 15,
        daysPerWeek: 4,
        level: 'new',
        freeTime: 'evening',
      },
      startKey: null,
      checkins: {},
      xp: 0,
      coins: 30,
      owned: ['none'],
      placed: [],
      theme: null,
      acc: 'none',
      visibility: 'self',
      invisibleUntil: null,
      revealPromptDismissed: false,
      lookingForBuddy: false,
      cheersSent: 0,
      surveys: [],
      lastSeenStreak: 0,
      bestStreak: 0,
      freezeUsed: false,
      revealed: false,
      cards: {},
      pass: null,
      priceVariant: null,
      fakeDoor: { views: 0, buyClicks: 0, parentClicks: 0, teacherInvites: 0 },
      coupons: [],
    };
  }

  // Fill fields added in later versions so old saves keep working.
  function upgrade(p) {
    const base = freshPlayer();
    Object.keys(base).forEach((k) => {
      if (p[k] === undefined) p[k] = base[k];
    });
    p.profile = Object.assign(base.profile, p.profile);
    p.fakeDoor = Object.assign(base.fakeDoor, p.fakeDoor);
    if (p.startKey && p.onboarded === false && p.profile.nickname) p.onboarded = true;
    return p;
  }

  function cleanText(v, max) {
    return String(v == null ? '' : v)
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .trim()
      .slice(0, max);
  }

  function cleanProfile(input) {
    const p = input || {};
    const out = {
      nickname: cleanText(p.nickname, 20),
      avatar: D.AVATARS.includes(p.avatar) ? p.avatar : D.AVATARS[0],
      schoolId: byId(D.SCHOOLS, p.schoolId) ? p.schoolId : '',
      schoolOther: cleanText(p.schoolOther, 60),
      unit: cleanText(p.unit, 30),
      interests: Array.isArray(p.interests) ? p.interests.filter((i) => byId(D.ACTIVITIES, i)).slice(0, D.ACTIVITIES.length) : [],
      minutes: MINUTES.includes(Number(p.minutes)) ? Number(p.minutes) : 15,
      daysPerWeek: Number(p.daysPerWeek) >= 3 && Number(p.daysPerWeek) <= 7 ? Number(p.daysPerWeek) : 4,
      level: byId(D.LEVELS, p.level) ? p.level : 'new',
      freeTime: byId(D.FREE_TIMES, p.freeTime) ? p.freeTime : 'evening',
    };
    if (!out.nickname) fail('ใส่ชื่อเล่นก่อนนะ');
    if (!out.schoolId) fail('เลือกสถาบันก่อนนะ');
    if (out.schoolId === 'other' && !out.schoolOther) fail('พิมพ์ชื่อสถาบันก่อนนะ');
    if (out.schoolId !== 'other') out.schoolOther = '';
    if (!out.interests.length) fail('เลือกอย่างน้อย 1 กิจกรรม');
    out.interests = Array.from(new Set(out.interests));
    return out;
  }

  function onboard(p, today, profile) {
    if (p.onboarded) fail('ตั้งค่าโปรไฟล์ไปแล้ว');
    p.profile = cleanProfile(profile);
    p.onboarded = true;
    p.startKey = today;
    p.invisibleUntil = L.addDays(today, L.INVISIBLE_DAYS);
    return {};
  }

  function requireOnboarded(p) {
    if (!p.onboarded) fail('ยังไม่ได้ตั้งค่าโปรไฟล์');
  }

  function streak(p, today) {
    return L.computeStreak(p.checkins, today, p.startKey || today);
  }

  function checkin(p, today, args) {
    requireOnboarded(p);
    const a = args || {};
    if (p.checkins[today]) fail('วันนี้เช็คอินไปแล้ว');
    const activity = byId(D.ACTIVITIES, a.activity) ? a.activity : fail('เลือกกิจกรรมก่อนนะ');
    const kind = a.kind === 'partial' ? 'partial' : 'full';
    const mood = a.mood && byId(D.MOODS, a.mood) ? a.mood : null;
    const before = streak(p, today).count;
    const reward = L.rewardFor(kind, before);
    const message = D.ENCOURAGEMENTS[Math.floor(L.seededRandom(today + p.seed) * D.ENCOURAGEMENTS.length)];
    const prevLevel = L.levelFor(p.xp).level;
    p.checkins[today] = { activity, kind, mood, xp: reward.xp, coins: reward.coins, message };
    p.xp += reward.xp;
    p.coins += reward.coins;
    const after = streak(p, today).count;
    const unlocked = D.ITEMS.concat(D.ACCESSORIES).filter((i) => i.unlock && after >= i.unlock.streak && !p.owned.includes(i.id));
    unlocked.forEach((i) => p.owned.push(i.id));
    const lv = L.levelFor(p.xp);
    return { reward, message, unlocked: unlocked.map((i) => i.id), levelUp: lv.level > prevLevel ? lv.level : null };
  }

  // Called whenever a snapshot is built: records the exit survey prompt and awards cards.
  function refresh(p, today, social) {
    if (!p.onboarded) return { askSurvey: null, newCards: [] };
    const s = streak(p, today);
    const prev = p.lastSeenStreak;
    let askSurvey = null;
    if (s.count === 0 && prev >= 2 && !p.surveys.some((x) => x.key === today)) {
      p.surveys.push({ key: today, reason: null, streak: prev });
      askSurvey = prev;
    }
    p.lastSeenStreak = s.count;
    p.bestStreak = Math.max(p.bestStreak, s.count);
    if (s.frozenDays.length) p.freezeUsed = true;
    if (p.visibility !== 'self') p.revealed = true;

    const list = Object.values(p.checkins);
    const stats = {
      total: list.length,
      partial: list.filter((c) => c.kind === 'partial').length,
      bestStreak: p.bestStreak,
      freezeUsed: p.freezeUsed ? 1 : 0,
      activities: new Set(list.map((c) => c.activity)).size,
      group: social && social.group ? 1 : 0,
      buddy: social && social.buddy ? 1 : 0,
      cheers: p.cheersSent,
      revealed: p.revealed ? 1 : 0,
    };
    const newCards = L.achievementsEarned(D.ACHIEVEMENTS, stats).filter((id) => !p.cards[id]);
    newCards.forEach((id) => (p.cards[id] = 1));
    return { askSurvey, newCards };
  }

  function survey(p, today, args) {
    const reason = args && args.reason ? String(args.reason) : '';
    if (reason && !D.EXIT_REASONS.includes(reason)) fail('ตัวเลือกไม่ถูกต้อง');
    const last = p.surveys[p.surveys.length - 1];
    if (last) last.reason = reason || null;
    return {};
  }

  function setVisibility(p, today, args) {
    requireOnboarded(p);
    const v = args && args.value;
    if (!VISIBILITY.includes(v)) fail('ตัวเลือกไม่ถูกต้อง');
    p.visibility = v;
    return {};
  }

  function revealLater(p) {
    p.revealPromptDismissed = true;
    return {};
  }

  function setGoal(p, today, args) {
    const a = args || {};
    if (a.minutes !== undefined) {
      if (!MINUTES.includes(Number(a.minutes))) fail('ตัวเลือกไม่ถูกต้อง');
      p.profile.minutes = Number(a.minutes);
    }
    if (a.daysPerWeek !== undefined) {
      const d = Number(a.daysPerWeek);
      if (!(d >= 3 && d <= 7)) fail('ตัวเลือกไม่ถูกต้อง');
      p.profile.daysPerWeek = d;
    }
    return {};
  }

  // ---- room & shop ----

  function findItem(id) {
    return byId(D.ITEMS, id) || byId(D.ACCESSORIES, id);
  }

  function toggleItem(p, today, args) {
    const id = args && args.id;
    const item = findItem(id);
    if (!item || !p.owned.includes(id)) fail('ยังไม่มีของชิ้นนี้');
    if (byId(D.ACCESSORIES, id)) p.acc = p.acc === id ? 'none' : id;
    else if (item.theme) p.theme = p.theme === id ? null : id;
    else if (p.placed.includes(id)) p.placed = p.placed.filter((x) => x !== id);
    else p.placed.push(id);
    return {};
  }

  function buy(p, today, args) {
    const id = args && args.id;
    const item = findItem(id);
    if (!item || item.season || item.unlock || id === 'none') fail('ของชิ้นนี้ซื้อไม่ได้');
    if (p.owned.includes(id)) fail('มีของชิ้นนี้แล้ว');
    if (p.coins < item.cost) fail('เหรียญยังไม่พอ');
    p.coins -= item.cost;
    p.owned.push(id);
    toggleItem(p, today, { id });
    return { item: id };
  }

  // ---- Battle Pass ----

  function passState(p, today) {
    const season = L.seasonFor(today);
    if (!p.pass || p.pass.season !== season.number) {
      p.pass = { season: season.number, premium: false, claimedFree: [], claimedPremium: [] };
    }
    if (!p.priceVariant) p.priceVariant = D.PASS_PRICES[Math.floor(Math.random() * D.PASS_PRICES.length)];
    return p.pass;
  }

  function seasonTier(p, today) {
    return L.tierFor(L.xpBetween(p.checkins, L.seasonFor(today).startKey, today)).tier;
  }

  function rewardLabel(r) {
    if (r.coins) return '🪙 ' + r.coins;
    if (r.pack) return '🃏 การ์ด ' + r.pack + ' แพ็ก';
    const item = findItem(r.item);
    return item.emoji + ' ' + item.name;
  }

  function grant(p, r, seed) {
    if (r.coins) p.coins += r.coins;
    if (r.item && !p.owned.includes(r.item)) p.owned.push(r.item);
    if (!r.pack) return [];
    return L.openPack(D.PHOTOCARDS, seed, 3 * r.pack).map((id) => {
      const isNew = !p.cards[id];
      p.cards[id] = (p.cards[id] || 0) + 1;
      return { id, isNew };
    });
  }

  function claim(p, today, args) {
    requireOnboarded(p);
    const pass = passState(p, today);
    const tier = seasonTier(p, today);
    const keys = (args && Array.isArray(args.keys) ? args.keys : []).slice(0, 2 * L.MAX_TIER);
    let pulled = [];
    const labels = [];
    keys.forEach((key) => {
      const track = key[0] === 'premium' ? 'premium' : key[0] === 'free' ? 'free' : fail('รางวัลไม่ถูกต้อง');
      const i = Number(key[1]);
      if (!Number.isInteger(i) || i < 0 || i >= L.MAX_TIER) fail('รางวัลไม่ถูกต้อง');
      if (i >= tier) fail('ยังไปไม่ถึง tier นี้');
      if (track === 'premium' && !pass.premium) fail('ต้องปลดล็อก Premium ก่อน');
      const list = track === 'free' ? pass.claimedFree : pass.claimedPremium;
      if (list.includes(i)) return;
      list.push(i);
      const r = (track === 'free' ? D.PASS_FREE : D.PASS_PREMIUM)[i];
      labels.push(rewardLabel(r));
      pulled = pulled.concat(grant(p, r, [p.seed, pass.season, track, i].join('|')));
    });
    return { pulled, labels };
  }

  function claimAll(p, today) {
    const pass = passState(p, today);
    const tier = seasonTier(p, today);
    const keys = [];
    for (let i = 0; i < tier; i++) {
      keys.push(['free', i]);
      if (pass.premium) keys.push(['premium', i]);
    }
    return claim(p, today, { keys });
  }

  // Prototype only: there is no payment yet, so "buying" unlocks a free trial.
  function unlockPremium(p, today) {
    passState(p, today).premium = true;
    return {};
  }

  function fakeDoor(p, today, args) {
    const key = args && args.key;
    if (!Object.prototype.hasOwnProperty.call(p.fakeDoor, key)) fail('ไม่รู้จัก event นี้');
    p.fakeDoor[key]++;
    return {};
  }

  // ---- cards ----

  function hasDuplicate(p, id) {
    return Boolean(byId(D.PHOTOCARDS, id)) && (p.cards[id] || 0) >= 2;
  }

  function moveCard(from, to, id) {
    if (!hasDuplicate(from, id)) fail('แลกได้เฉพาะการ์ดใบซ้ำ');
    from.cards[id]--;
    to.cards[id] = (to.cards[id] || 0) + 1;
  }

  // ---- coupons ----

  function redeem(p, today, args) {
    requireOnboarded(p);
    const partner = byId(D.PARTNERS, args && args.partnerId);
    if (!partner) fail('ไม่พบร้านนี้');
    if (!L.canRedeem(p.coupons, today)) fail('สัปดาห์นี้แลกไปแล้ว 1 ใบ');
    if (p.coins < partner.cost) fail('เหรียญยังไม่พอ');
    const code = String(args.code || '');
    if (!/^AL\d{6}$/.test(code)) fail('รหัสคูปองไม่ถูกต้อง');
    p.coins -= partner.cost;
    const coupon = { partnerId: partner.id, code, issuedKey: today, usedKey: null };
    p.coupons.push(coupon);
    return { coupon };
  }

  function useCoupon(p, today, args) {
    const c = p.coupons.find((x) => x.code === (args && args.code));
    if (!c) fail('ไม่พบคูปองนี้');
    if (L.couponStatus(c, today) !== 'active') fail('คูปองนี้ใช้ไม่ได้แล้ว');
    c.usedKey = today;
    return { coupon: c };
  }

  // Actions that only touch the player's own data, keyed by the name the UI sends.
  const ACTIONS = {
    onboard: (p, t, a) => onboard(p, t, a && a.profile),
    checkin,
    survey,
    visibility: setVisibility,
    'reveal-later': revealLater,
    goal: setGoal,
    buy,
    'toggle-item': toggleItem,
    claim,
    'claim-all': claimAll,
    'unlock-premium': unlockPremium,
    'fake-door': fakeDoor,
    'use-coupon': useCoupon,
  };

  const api = {
    EngineError,
    ACTIONS,
    freshPlayer,
    upgrade,
    cleanProfile,
    streak,
    refresh,
    passState,
    seasonTier,
    rewardLabel,
    redeem,
    hasDuplicate,
    moveCard,
    findItem,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(this);
