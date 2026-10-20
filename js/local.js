// Offline backend: the whole game runs in this browser with simulated friends.
// Same interface as RemoteBackend so the UI does not care which one it talks to.
(function () {
  'use strict';

  const L = window.Logic;
  const D = window.Data;
  const E = window.Engine;
  const KEY = 'activelift-school-v1';
  const fail = (msg) => {
    throw new E.EngineError(msg);
  };

  function LocalBackend() {
    let p = load();

    function load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return withLocalFields(E.upgrade(JSON.parse(raw)));
      } catch (e) {
        /* storage unavailable: in-memory session */
      }
      return withLocalFields(E.freshPlayer());
    }

    // Simulated social data lives next to the player in the same saved object.
    function withLocalFields(player) {
      if (player.group === undefined) player.group = null;
      if (player.buddy === undefined) player.buddy = null;
      if (!Array.isArray(player.blocked)) player.blocked = [];
      return player;
    }

    function save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(p));
      } catch (e) {
        /* ignore */
      }
    }

    function today() {
      const d = new Date();
      d.setDate(d.getDate() + (p.dayOffset || 0));
      return L.keyFromLocalDate(d);
    }

    const person = (name) => D.PEOPLE.find((x) => x.name === name);

    function view(m, t) {
      return {
        id: m.name,
        name: m.name,
        avatar: m.avatar,
        visible: true,
        streak: L.mockStreak(m, t),
        checkedToday: L.mockChecked(m, t),
        room: { placed: m.items, theme: null, acc: 'none' },
      };
    }

    function social(t) {
      const out = { group: null, buddy: null, buddyRequests: [], cheers: [], tradeOffers: [], outgoingTrades: 0 };
      if (p.group) {
        const members = p.group.members.map(person).filter((m) => m && !p.blocked.includes(m.name));
        const gs = L.groupStreak(p.checkins, members, p.group.createdKey, t);
        out.group = {
          name: p.group.name,
          code: p.group.code,
          createdKey: p.group.createdKey,
          members: members.map((m) => view(m, t)),
          streak: gs.count,
          countsToday: gs.countsToday,
          need: gs.need,
          total: gs.total,
          remaining: Math.max(0, gs.need - gs.doneToday),
        };
      }
      if (p.buddy) {
        out.buddy = Object.assign(view(person(p.buddy.name), t), {
          status: p.buddy.status,
          startKey: p.buddy.startKey,
          trialLeft: Math.max(0, L.BUDDY_TRIAL_DAYS - L.diffDays(p.buddy.startKey, t)),
          iConfirmed: false,
        });
      }
      return out;
    }

    function league(t) {
      const schools = D.SCHOOLS.filter((x) => x.id !== 'other');
      if (p.profile.schoolId === 'other') schools.push({ id: 'other', name: p.profile.schoolOther || 'โรงเรียนของฉัน' });
      const weekXp = L.xpBetween(p.checkins, L.weekKey(t), t);
      return L.schoolLeague(schools, p.profile.schoolId, weekXp, p.visibility === 'school', t);
    }

    function tournament(t) {
      const tour = L.tournamentFor(t);
      const seeds = D.TOURNAMENT_SCHOOLS.slice().sort((a, b) => L.seededRandom(a + '|seed|' + tour.season) - L.seededRandom(b + '|seed|' + tour.season));
      const counted = p.visibility === 'school';
      const score = (id, round) => {
        const days = Object.keys(p.checkins).filter((k) => k >= round.startKey && k <= round.endKey).length;
        return L.tournamentScore({ id }, round, t, id === p.profile.schoolId ? { counted, days } : null);
      };
      return { tour, rounds: L.bracket(seeds, tour.rounds, t, score) };
    }

    function snapshot() {
      const t = today();
      if (!p.onboarded) return { mode: 'local', today: t, player: p, devTools: true };
      E.passState(p, t);
      const s = social(t);
      const events = E.refresh(p, t, { group: s.group, buddy: s.buddy });
      save();
      return { mode: 'local', today: t, player: p, social: s, league: league(t), tournament: tournament(t), events, devTools: true };
    }

    function friendNames() {
      return (p.group ? p.group.members : []).concat(p.buddy ? [p.buddy.name] : []).filter((n) => !p.blocked.includes(n));
    }

    function freeMockPeople() {
      return D.PEOPLE.filter((x) => !p.blocked.includes(x.name) && (!p.buddy || p.buddy.name !== x.name));
    }

    const LOCAL = {
      redeem(a, t) {
        const code = 'AL' + String(Math.floor(L.seededRandom(p.seed + t + a.partnerId) * 900000) + 100000);
        return E.redeem(p, t, { partnerId: a.partnerId, code });
      },
      'next-day'() {
        p.dayOffset = (p.dayOffset || 0) + 1;
        return {};
      },
      'create-group'(a, t) {
        if (p.group) fail('คุณอยู่ในกลุ่มแล้ว');
        const name = String(a.name || '').trim().slice(0, 30) || 'แก๊งขยับของ' + p.profile.nickname;
        const code = 'AL-' + String(Math.floor(L.seededRandom(p.seed + t) * 900000) + 100000);
        p.group = { name, code, createdKey: t, members: freeMockPeople().slice(0, 3).map((x) => x.name) };
        return { code, simulated: p.group.members.length };
      },
      'join-group'(a, t) {
        if (p.group) fail('คุณอยู่ในกลุ่มแล้ว ออกจากกลุ่มเดิมก่อนนะ');
        const code = String(a.code || '').trim().toUpperCase();
        if (!code) fail('ใส่รหัสกลุ่มก่อนนะ');
        p.group = { name: 'ก๊วนแบดหลังเลิกเรียน', code, createdKey: t, members: freeMockPeople().slice(3, 7).map((x) => x.name) };
        return { name: p.group.name };
      },
      'leave-group'() {
        if (!p.group) fail('คุณยังไม่มีกลุ่ม');
        p.group = null;
        return {};
      },
      cheer(a) {
        if (!D.CHEERS.includes(a.message)) fail('ส่งได้เฉพาะข้อความสำเร็จรูป');
        if (!friendNames().includes(a.to)) fail('ส่งกำลังใจได้เฉพาะเพื่อนในกลุ่มหรือบัดดี้');
        p.cheersSent++;
        return { name: a.to };
      },
      'cheers-read'() {
        return {};
      },
      'buddy-find'() {
        const taken = p.group ? p.group.members : [];
        const candidates = D.PEOPLE.filter((x) => !p.blocked.includes(x.name) && !taken.includes(x.name))
          .map((x) => Object.assign({ id: x.name, name: x.name, avatar: x.avatar }, L.buddyScore(p.profile, x)))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        return { candidates };
      },
      'buddy-stop-looking'() {
        return {};
      },
      // Simulated people always accept, so the trial starts straight away.
      'buddy-request'(a, t) {
        if (p.buddy) fail('คุณมีบัดดี้อยู่แล้ว');
        if (!person(a.to)) fail('ไม่พบคนนี้');
        p.buddy = { name: a.to, status: 'trial', startKey: t };
        return { name: a.to, accepted: true };
      },
      'buddy-respond'() {
        fail('ไม่มีคำขอรอตอบ');
      },
      'buddy-link'(a, t) {
        if (!p.buddy || p.buddy.status !== 'trial') fail('ยังไม่อยู่ในช่วงลองคุย');
        if (L.diffDays(p.buddy.startKey, t) < L.BUDDY_TRIAL_DAYS) fail('รอครบช่วงลองคุยก่อนนะ');
        p.buddy.status = 'linked';
        return { linked: true };
      },
      'buddy-end'() {
        if (!p.buddy) fail('คุณยังไม่มีบัดดี้');
        p.buddy = null;
        return {};
      },
      'buddy-report'() {
        if (!p.buddy) fail('คุณยังไม่มีบัดดี้');
        p.blocked.push(p.buddy.name);
        if (p.group) p.group.members = p.group.members.filter((n) => n !== p.buddy.name);
        p.buddy = null;
        return {};
      },
      // Simulated friends answer instantly with a card you are missing.
      'trade-offer'(a, t) {
        if (!friendNames().includes(a.to)) fail('แลกได้เฉพาะเพื่อนในกลุ่มหรือบัดดี้');
        if (!E.hasDuplicate(p, a.card)) fail('แลกได้เฉพาะการ์ดใบซ้ำ');
        const missing = D.PHOTOCARDS.filter((c) => !p.cards[c.id] && c.id !== a.card);
        if (!missing.length) fail('คุณสะสมครบทุกใบแล้ว!');
        const got = missing[Math.floor(L.seededRandom(a.to + '|' + a.card + '|' + t) * missing.length)].id;
        p.cards[a.card]--;
        p.cards[got] = 1;
        return { got, name: a.to };
      },
      'trade-respond'() {
        fail('ไม่พบข้อเสนอนี้');
      },
    };

    this.mode = 'local';

    this.init = () => Promise.resolve({ snapshot: snapshot() });

    this.call = (name, args) => {
      try {
        const t = today();
        const a = args || {};
        let result;
        if (LOCAL[name]) result = LOCAL[name](a, t);
        else if (E.ACTIONS[name]) result = E.ACTIONS[name](p, t, a);
        else fail('ไม่รู้จักคำสั่งนี้');
        save();
        return Promise.resolve({ result, snapshot: snapshot() });
      } catch (e) {
        return Promise.reject(e);
      }
    };

    this.exportData = () => Promise.resolve(p);

    this.reset = () => {
      p = withLocalFields(E.freshPlayer());
      save();
      return Promise.resolve({ snapshot: snapshot() });
    };
  }

  window.LocalBackend = LocalBackend;
})();
