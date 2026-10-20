// Server-side game: builds snapshots for a user and applies actions against SQLite.
'use strict';

const crypto = require('node:crypto');
const L = require('../js/logic.js');
const D = require('../js/data.js');
const Engine = require('../js/engine.js');
const { tx } = require('./db.js');

const { EngineError } = Engine;
const fail = (msg) => {
  throw new EngineError(msg);
};

const GROUP_MAX = 10;
const CHEERS_PER_DAY = 30;
const PENDING_TRADES_MAX = 5;
const ACTIVE_BUDDY = "status IN ('pending', 'trial', 'linked')";

// Everyone in the target market is in Thailand, so "today" is the Bangkok calendar day.
function bangkokToday(now) {
  const d = new Date((now || Date.now()) + 7 * 3600000);
  return d.toISOString().slice(0, 10);
}

function randomCode(prefix, length, alphabet) {
  const bytes = crypto.randomBytes(length);
  return prefix + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

class Game {
  constructor(db, opts) {
    this.db = db;
    this.devTime = Boolean(opts && opts.devTime);
    this.now = (opts && opts.now) || (() => Date.now());
  }

  // ---------- users ----------

  createUser(username, passHash) {
    const player = Engine.freshPlayer();
    const info = this.db
      .prepare('INSERT INTO users (username, pass_hash, player, created_at) VALUES (?, ?, ?, ?)')
      .run(username, passHash, JSON.stringify(player), new Date(this.now()).toISOString());
    return Number(info.lastInsertRowid);
  }

  row(id) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  player(row) {
    return Engine.upgrade(JSON.parse(row.player));
  }

  save(id, p) {
    this.db
      .prepare('UPDATE users SET player = ?, nickname = ?, avatar = ?, school_id = ?, school_other = ?, visibility = ?, looking_for_buddy = ? WHERE id = ?')
      .run(JSON.stringify(p), p.profile.nickname, p.profile.avatar, p.profile.schoolId, p.profile.schoolOther, p.visibility, p.lookingForBuddy ? 1 : 0, id);
  }

  today(p) {
    return L.addDays(bangkokToday(this.now()), this.devTime ? p.dayOffset || 0 : 0);
  }

  deleteUser(id) {
    tx(this.db, () => {
      this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
      this.db.prepare('DELETE FROM groups WHERE id NOT IN (SELECT group_id FROM group_members)').run();
    });
  }

  // ---------- relationships ----------

  blockedEitherWay(a, b) {
    return Boolean(this.db.prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').get(a, b, b, a));
  }

  groupOf(id) {
    return this.db.prepare('SELECT g.* FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ?').get(id) || null;
  }

  groupMateIds(id) {
    const g = this.groupOf(id);
    if (!g) return [];
    return this.db
      .prepare('SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?')
      .all(g.id, id)
      .map((r) => r.user_id);
  }

  buddyRow(id) {
    return this.db.prepare(`SELECT * FROM buddies WHERE (from_id = ? OR to_id = ?) AND ${ACTIVE_BUDDY} ORDER BY id DESC`).get(id, id) || null;
  }

  // Group mates and an accepted buddy can cheer and trade with each other.
  isFriend(me, other) {
    if (me === other || this.blockedEitherWay(me, other)) return false;
    if (this.groupMateIds(me).includes(other)) return true;
    const b = this.buddyRow(me);
    return Boolean(b && b.status !== 'pending' && (b.from_id === other || b.to_id === other));
  }

  // What a friend may see of someone, respecting their visibility setting.
  personView(row, today, opts) {
    const p = this.player(row);
    const visible = p.visibility !== 'self';
    const showProgress = visible || (opts && opts.buddy);
    const s = Engine.streak(p, today);
    return {
      id: row.id,
      name: row.nickname,
      avatar: row.avatar,
      visible,
      streak: showProgress ? s.count : null,
      checkedToday: showProgress ? Boolean(p.checkins[today]) : null,
      room: visible ? { placed: p.placed, theme: p.theme, acc: p.acc } : null,
    };
  }

  // ---------- snapshot ----------

  social(id, p, today) {
    const db = this.db;
    const out = { group: null, buddy: null, buddyRequests: [], cheers: [], tradeOffers: [], outgoingTrades: 0 };

    const g = this.groupOf(id);
    if (g) {
      const rows = db.prepare('SELECT u.* FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? AND u.id != ? ORDER BY u.id').all(g.id, id);
      const sets = [p.checkins].concat(rows.map((r) => this.player(r).checkins));
      const gs = L.groupStreakFrom(sets, g.created_key, today);
      out.group = {
        name: g.name,
        code: g.code,
        createdKey: g.created_key,
        members: rows.map((r) => this.personView(r, today)),
        streak: gs.count,
        countsToday: gs.countsToday,
        need: gs.need,
        total: gs.total,
        remaining: Math.max(0, gs.need - gs.doneToday),
      };
    }

    const b = this.buddyRow(id);
    if (b) {
      const otherId = b.from_id === id ? b.to_id : b.from_id;
      const view = this.personView(this.row(otherId), today, { buddy: b.status !== 'pending' });
      let status = b.status;
      if (b.status === 'pending') status = b.from_id === id ? 'pending_out' : 'pending_in';
      out.buddy = Object.assign(view, {
        status,
        startKey: b.start_key,
        trialLeft: b.start_key ? Math.max(0, L.BUDDY_TRIAL_DAYS - L.diffDays(b.start_key, today)) : null,
        iConfirmed: Boolean(b.from_id === id ? b.from_link : b.to_link),
      });
      if (status === 'pending_in') out.buddyRequests.push({ id: otherId, name: view.name, avatar: view.avatar });
    }

    out.cheers = db
      .prepare('SELECT c.id, c.message, c.day, u.nickname AS name, u.avatar FROM cheers c JOIN users u ON u.id = c.from_id WHERE c.to_id = ? AND c.seen = 0 ORDER BY c.id DESC LIMIT 20')
      .all(id)
      .map((r) => Object.assign({}, r));
    out.tradeOffers = db
      .prepare("SELECT t.id, t.give_card AS card, u.nickname AS name, u.avatar FROM trades t JOIN users u ON u.id = t.from_id WHERE t.to_id = ? AND t.status = 'pending' ORDER BY t.id")
      .all(id)
      .map((r) => Object.assign({}, r));
    out.outgoingTrades = db.prepare("SELECT COUNT(*) AS n FROM trades WHERE from_id = ? AND status = 'pending'").get(id).n;
    return out;
  }

  league(p, today) {
    const week = L.weekKey(today);
    const members = new Map(
      this.db
        .prepare("SELECT school_id, COUNT(*) AS n FROM users WHERE visibility = 'school' AND school_id != '' AND school_id != 'other' GROUP BY school_id")
        .all()
        .map((r) => [r.school_id, r.n])
    );
    const totals = new Map(
      this.db
        .prepare("SELECT u.school_id, SUM(c.xp) AS total FROM checkins c JOIN users u ON u.id = c.user_id WHERE u.visibility = 'school' AND c.day BETWEEN ? AND ? GROUP BY u.school_id")
        .all(week, today)
        .map((r) => [r.school_id, r.total])
    );
    return D.SCHOOLS.filter((s) => s.id !== 'other')
      .map((s) => {
        const n = members.get(s.id) || 0;
        const total = totals.get(s.id) || 0;
        return { id: s.id, name: s.name, members: n, total, avg: n ? Math.round(total / n) : 0, mine: s.id === p.profile.schoolId };
      })
      .sort((a, b) => b.avg - a.avg || b.members - a.members || a.name.localeCompare(b.name, 'th'))
      .map((r, i) => Object.assign(r, { rank: i + 1 }));
  }

  // Share of a school's opted-in members who moved on at least TOURNAMENT_MIN_DAYS days that round.
  tournamentScore(schoolId, round, today) {
    const end = round.endKey < today ? round.endKey : today;
    const n = this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE school_id = ? AND visibility = 'school'").get(schoolId).n;
    if (!n) return 0;
    const active = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT c.user_id FROM checkins c JOIN users u ON u.id = c.user_id
           WHERE u.school_id = ? AND u.visibility = 'school' AND c.day BETWEEN ? AND ?
           GROUP BY c.user_id HAVING COUNT(*) >= ?)`
      )
      .get(schoolId, round.startKey, end, L.TOURNAMENT_MIN_DAYS).n;
    return Math.round((active / n) * 1000) / 10;
  }

  tournament(today) {
    const tour = L.tournamentFor(today);
    const seeds = D.TOURNAMENT_SCHOOLS.slice().sort((a, b) => L.seededRandom(a + '|seed|' + tour.season) - L.seededRandom(b + '|seed|' + tour.season));
    return { tour, rounds: L.bracket(seeds, tour.rounds, today, (id, round) => this.tournamentScore(id, round, today)) };
  }

  snapshot(id) {
    const row = this.row(id);
    if (!row) return null;
    const p = this.player(row);
    const today = this.today(p);
    if (!p.onboarded) return { mode: 'remote', today, player: p, username: row.username, devTools: this.devTime };
    Engine.passState(p, today);
    const social = this.social(id, p, today);
    const events = Engine.refresh(p, today, { group: social.group, buddy: social.buddy && social.buddy.status !== 'pending_out' && social.buddy.status !== 'pending_in' });
    this.save(id, p);
    return {
      mode: 'remote',
      today,
      username: row.username,
      player: p,
      social,
      league: this.league(p, today),
      tournament: this.tournament(today),
      events,
      devTools: this.devTime,
    };
  }

  // ---------- actions ----------

  action(id, name, args) {
    const result = tx(this.db, () => {
      const row = this.row(id);
      const p = this.player(row);
      const today = this.today(p);
      const out = this.apply(id, row, p, today, name, args || {});
      this.save(id, p);
      return out;
    });
    return { result, snapshot: this.snapshot(id) };
  }

  apply(id, row, p, today, name, args) {
    const db = this.db;
    const handler = SERVER_ACTIONS[name];
    if (handler) return handler.call(this, { id, row, p, today, args, db });
    const engineAction = Engine.ACTIONS[name];
    if (!engineAction) fail('ไม่รู้จักคำสั่งนี้');
    if (name !== 'onboard' && !p.onboarded) fail('ยังไม่ได้ตั้งค่าโปรไฟล์');
    return engineAction(p, today, args);
  }
}

// Actions that touch other users or shared tables. `this` is the Game.
const SERVER_ACTIONS = {
  checkin({ id, p, today, args, db }) {
    const out = Engine.ACTIONS.checkin(p, today, args);
    db.prepare('INSERT INTO checkins (user_id, day, xp) VALUES (?, ?, ?)').run(id, today, out.reward.xp);
    return out;
  },

  redeem({ id, p, today, args, db }) {
    let code;
    do code = randomCode('AL', 6, '0123456789');
    while (db.prepare('SELECT 1 FROM coupons WHERE code = ?').get(code));
    const out = Engine.redeem(p, today, { partnerId: args.partnerId, code });
    db.prepare('INSERT INTO coupons (code, user_id, partner_id, issued_key) VALUES (?, ?, ?, ?)').run(code, id, out.coupon.partnerId, today);
    return out;
  },

  'use-coupon'({ id, p, today, args, db }) {
    const out = Engine.ACTIONS['use-coupon'](p, today, args);
    db.prepare('UPDATE coupons SET used_key = ? WHERE code = ? AND user_id = ?').run(today, out.coupon.code, id);
    return out;
  },

  'next-day'({ p }) {
    if (!this.devTime) fail('เครื่องมือทดสอบปิดอยู่บนเซิร์ฟเวอร์นี้');
    p.dayOffset = (p.dayOffset || 0) + 1;
    return {};
  },

  // ---- close-friends group ----

  'create-group'({ id, p, today, args, db }) {
    if (this.groupOf(id)) fail('คุณอยู่ในกลุ่มแล้ว');
    const name = String(args.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30);
    let code;
    do code = randomCode('AL-', 6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    while (db.prepare('SELECT 1 FROM groups WHERE code = ?').get(code));
    const info = db.prepare('INSERT INTO groups (name, code, created_key) VALUES (?, ?, ?)').run(name || 'แก๊งขยับของ' + p.profile.nickname, code, today);
    db.prepare('INSERT INTO group_members (user_id, group_id) VALUES (?, ?)').run(id, Number(info.lastInsertRowid));
    return { code };
  },

  'join-group'({ id, args, db }) {
    if (this.groupOf(id)) fail('คุณอยู่ในกลุ่มแล้ว ออกจากกลุ่มเดิมก่อนนะ');
    const code = String(args.code || '').trim().toUpperCase();
    const g = db.prepare('SELECT * FROM groups WHERE code = ?').get(code);
    if (!g) fail('ไม่พบกลุ่มนี้ ลองเช็ครหัสอีกทีนะ');
    const n = db.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?').get(g.id).n;
    if (n >= GROUP_MAX) fail('กลุ่มนี้เต็มแล้ว (10 คน)');
    db.prepare('INSERT INTO group_members (user_id, group_id) VALUES (?, ?)').run(id, g.id);
    return { name: g.name };
  },

  'leave-group'({ id, db }) {
    const g = this.groupOf(id);
    if (!g) fail('คุณยังไม่มีกลุ่ม');
    db.prepare('DELETE FROM group_members WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM groups WHERE id = ? AND id NOT IN (SELECT group_id FROM group_members)').run(g.id);
    return {};
  },

  // ---- cheers: preset messages only, to friends only ----

  cheer({ id, p, today, args, db }) {
    const to = Number(args.to);
    if (!D.CHEERS.includes(args.message)) fail('ส่งได้เฉพาะข้อความสำเร็จรูป');
    if (!this.isFriend(id, to)) fail('ส่งกำลังใจได้เฉพาะเพื่อนในกลุ่มหรือบัดดี้');
    const sent = db.prepare('SELECT COUNT(*) AS n FROM cheers WHERE from_id = ? AND day = ?').get(id, today).n;
    if (sent >= CHEERS_PER_DAY) fail('วันนี้ส่งกำลังใจเยอะมากแล้ว พรุ่งนี้ส่งต่อนะ 💛');
    db.prepare('INSERT INTO cheers (from_id, to_id, message, day) VALUES (?, ?, ?, ?)').run(id, to, args.message, today);
    p.cheersSent++;
    return { name: this.row(to).nickname };
  },

  'cheers-read'({ id, db }) {
    db.prepare('UPDATE cheers SET seen = 1 WHERE to_id = ?').run(id);
    return {};
  },

  // ---- buddy matching: opt-in, same institution, request -> accept -> 3-day trial ----

  'buddy-find'({ id, p, db }) {
    if (this.buddyRow(id)) fail('คุณมีบัดดี้หรือคำขออยู่แล้ว');
    p.lookingForBuddy = true;
    const mates = this.groupMateIds(id);
    const rows = db
      .prepare(`SELECT * FROM users WHERE looking_for_buddy = 1 AND id != ? AND school_id = ? AND school_other = ?
                AND id NOT IN (SELECT from_id FROM buddies WHERE ${ACTIVE_BUDDY})
                AND id NOT IN (SELECT to_id FROM buddies WHERE ${ACTIVE_BUDDY})`)
      .all(id, p.profile.schoolId, p.profile.schoolOther);
    const candidates = rows
      .filter((r) => !mates.includes(r.id) && !this.blockedEitherWay(id, r.id))
      .map((r) => {
        const other = this.player(r);
        const s = L.buddyScore(p.profile, other.profile);
        return { id: r.id, name: r.nickname, avatar: r.avatar, score: s.score, reasons: s.reasons, shared: s.shared };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return { candidates };
  },

  'buddy-stop-looking'({ p }) {
    p.lookingForBuddy = false;
    return {};
  },

  'buddy-request'({ id, p, args, db }) {
    const to = Number(args.to);
    const other = this.row(to);
    if (this.buddyRow(id)) fail('คุณมีบัดดี้หรือคำขออยู่แล้ว');
    if (!other || to === id || !other.looking_for_buddy) fail('คนนี้ยังไม่ได้เปิดรับบัดดี้');
    if (other.school_id !== p.profile.schoolId || other.school_other !== p.profile.schoolOther) fail('จับคู่ได้เฉพาะสถาบันเดียวกัน');
    if (this.blockedEitherWay(id, to) || this.buddyRow(to)) fail('ตอนนี้จับคู่กับคนนี้ไม่ได้');
    db.prepare("INSERT INTO buddies (from_id, to_id, status) VALUES (?, ?, 'pending')").run(id, to);
    return { name: other.nickname };
  },

  'buddy-respond'({ id, p, today, args, db }) {
    const b = this.buddyRow(id);
    if (!b || b.status !== 'pending' || b.to_id !== id) fail('ไม่มีคำขอรอตอบ');
    if (args.accept) {
      db.prepare("UPDATE buddies SET status = 'trial', start_key = ? WHERE id = ?").run(today, b.id);
      // Both stop showing up as candidates; the caller's player is saved after the action.
      p.lookingForBuddy = false;
      this.clearLooking(b.from_id);
    } else {
      db.prepare("UPDATE buddies SET status = 'ended' WHERE id = ?").run(b.id);
    }
    return { accepted: Boolean(args.accept) };
  },

  'buddy-link'({ id, today, db }) {
    const b = this.buddyRow(id);
    if (!b || b.status !== 'trial') fail('ยังไม่อยู่ในช่วงลองคุย');
    if (L.diffDays(b.start_key, today) < L.BUDDY_TRIAL_DAYS) fail('รอครบช่วงลองคุยก่อนนะ');
    const col = b.from_id === id ? 'from_link' : 'to_link';
    db.prepare(`UPDATE buddies SET ${col} = 1 WHERE id = ?`).run(b.id);
    const after = db.prepare('SELECT * FROM buddies WHERE id = ?').get(b.id);
    if (after.from_link && after.to_link) db.prepare("UPDATE buddies SET status = 'linked' WHERE id = ?").run(b.id);
    return { linked: Boolean(after.from_link && after.to_link) };
  },

  'buddy-end'({ id, db }) {
    const b = this.buddyRow(id);
    if (!b) fail('คุณยังไม่มีบัดดี้');
    db.prepare("UPDATE buddies SET status = 'ended' WHERE id = ?").run(b.id);
    return {};
  },

  'buddy-report'({ id, p, db }) {
    const b = this.buddyRow(id);
    if (!b) fail('คุณยังไม่มีบัดดี้');
    const other = b.from_id === id ? b.to_id : b.from_id;
    db.prepare("UPDATE buddies SET status = 'ended' WHERE id = ?").run(b.id);
    db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)').run(id, other);
    db.prepare('INSERT INTO reports (reporter_id, reported_id, context, created_at) VALUES (?, ?, ?, ?)').run(id, other, 'buddy', new Date(this.now()).toISOString());
    p.lookingForBuddy = false;
    return {};
  },

  // ---- card trades: offer a duplicate, the friend picks one of theirs to send back ----

  'trade-offer'({ id, p, args, db }) {
    const to = Number(args.to);
    if (!this.isFriend(id, to)) fail('แลกได้เฉพาะเพื่อนในกลุ่มหรือบัดดี้');
    if (!Engine.hasDuplicate(p, args.card)) fail('แลกได้เฉพาะการ์ดใบซ้ำ');
    const pending = db.prepare("SELECT COUNT(*) AS n FROM trades WHERE from_id = ? AND status = 'pending'").get(id).n;
    if (pending >= PENDING_TRADES_MAX) fail('มีข้อเสนอรอตอบเยอะแล้ว รอเพื่อนตอบก่อนนะ');
    db.prepare("INSERT INTO trades (from_id, to_id, give_card, status) VALUES (?, ?, ?, 'pending')").run(id, to, args.card);
    return { pending: true, name: this.row(to).nickname };
  },

  'trade-respond'({ id, p, args, db }) {
    const t = db.prepare("SELECT * FROM trades WHERE id = ? AND to_id = ? AND status = 'pending'").get(Number(args.offerId), id);
    if (!t) fail('ไม่พบข้อเสนอนี้');
    if (!args.card) {
      db.prepare("UPDATE trades SET status = 'declined' WHERE id = ?").run(t.id);
      return { declined: true };
    }
    const fromRow = this.row(t.from_id);
    const from = this.player(fromRow);
    if (!Engine.hasDuplicate(from, t.give_card)) {
      db.prepare("UPDATE trades SET status = 'declined' WHERE id = ?").run(t.id);
      fail('เพื่อนไม่มีการ์ดใบนั้นซ้ำแล้ว');
    }
    Engine.moveCard(p, from, args.card);
    Engine.moveCard(from, p, t.give_card);
    this.save(t.from_id, from);
    db.prepare("UPDATE trades SET status = 'done', back_card = ? WHERE id = ?").run(args.card, t.id);
    return { got: t.give_card, name: fromRow.nickname };
  },
};

Game.prototype.clearLooking = function (userId) {
  const row = this.row(userId);
  const p = this.player(row);
  p.lookingForBuddy = false;
  this.save(userId, p);
};

module.exports = { Game, bangkokToday, EngineError };
