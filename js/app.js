// UI for the ActiveLift School prototype. State lives in localStorage only.
(function () {
  'use strict';

  const L = window.Logic;
  const D = window.Data;
  const STORAGE_KEY = 'activelift-school-v1';
  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal');

  // ---------- state ----------

  function freshState() {
    return {
      version: 1,
      onboarded: false,
      onboardStep: 0,
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
      group: null,
      buddy: null,
      blocked: [],
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
      tab: 'home',
      seasonView: 'pass',
      roomView: 'decor',
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign(freshState(), JSON.parse(raw));
    } catch (e) {
      /* storage unavailable: fall back to an in-memory session */
    }
    return freshState();
  }

  let state = load();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* ignore */
    }
  }

  function today() {
    const d = new Date();
    d.setDate(d.getDate() + state.dayOffset);
    return L.keyFromLocalDate(d);
  }

  // ---------- helpers ----------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  const byId = (list, id) => list.find((x) => x.id === id);

  function schoolName() {
    const p = state.profile;
    if (p.schoolId === 'other') return p.schoolOther || 'โรงเรียนของฉัน';
    const s = byId(D.SCHOOLS, p.schoolId);
    return s ? s.name : '';
  }

  function unitLabel() {
    const s = byId(D.SCHOOLS, state.profile.schoolId);
    return s && s.type === 'uni' ? 'คณะ' : 'ห้อง';
  }

  function streak() {
    return L.computeStreak(state.checkins, today(), state.startKey);
  }

  function peopleFor(names) {
    return names.map((n) => D.PEOPLE.find((p) => p.name === n)).filter(Boolean);
  }

  const toastQueue = [];
  let toastBusy = false;
  function toast(msg) {
    toastQueue.push(msg);
    // Keep only the latest few so rapid taps don't build a long backlog.
    toastQueue.splice(0, Math.max(0, toastQueue.length - 2));
    if (!toastBusy) nextToast();
  }

  function nextToast() {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    if (!toastQueue.length) {
      toastBusy = false;
      el.classList.remove('show');
      return;
    }
    toastBusy = true;
    el.textContent = toastQueue.shift();
    el.classList.add('show');
    setTimeout(nextToast, 2000);
  }

  function openModal(html) {
    modalRoot.innerHTML = '<div class="backdrop" data-action="close-modal"></div><div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
    modalRoot.hidden = false;
  }

  function closeModal() {
    modalRoot.hidden = true;
    modalRoot.innerHTML = '';
  }

  // ---------- onboarding ----------

  const ONBOARD_STEPS = 5;

  function renderOnboarding() {
    const p = state.profile;
    const step = state.onboardStep;
    const dots = Array.from({ length: ONBOARD_STEPS }, (_, i) => '<span class="dot' + (i <= step ? ' on' : '') + '"></span>').join('');
    let body = '';

    if (step === 0) {
      body = `
        <div class="hero">🏸✨</div>
        <h1>ActiveLift School</h1>
        <p class="lead">ออกกำลังกายกับเพื่อนจริง สนุกแบบเกม<br/>ไม่มีใครตัดสินรูปร่างใครที่นี่ 💛</p>
        <ul class="promise">
          <li>ไม่ถามน้ำหนัก ไม่มี BMI ไม่มีรูป before/after</li>
          <li>ได้ XP จาก “ทำตามที่ตั้งใจ” ไม่ใช่จากตัวเลขบนตาชั่ง</li>
          <li>ช่วงแรกจะไม่มีใครเห็นคุณ จนกว่าคุณจะพร้อม 👻</li>
        </ul>
        <button class="btn primary big" data-action="ob-next">เริ่มเลย</button>`;
    } else if (step === 1) {
      body = `
        <h2>เรียกคุณว่าอะไรดี?</h2>
        <label class="field">ชื่อเล่น
          <input id="ob-nick" maxlength="20" value="${esc(p.nickname)}" placeholder="เช่น โอ๊ต, มายด์" />
        </label>
        <p class="label">เลือกตัวละครของคุณ</p>
        <div class="avatar-grid">
          ${D.AVATARS.map((a) => `<button class="avatar-pick${a === p.avatar ? ' on' : ''}" data-action="ob-avatar" data-v="${a}">${a}</button>`).join('')}
        </div>
        <button class="btn primary big" data-action="ob-next">ต่อไป</button>`;
    } else if (step === 2) {
      body = `
        <h2>อยู่โรงเรียน/มหาวิทยาลัยไหน?</h2>
        <p class="muted">ใช้จัดกลุ่มเพื่อนและ School League (ยังไม่ต้องยืนยันอีเมล)</p>
        <label class="field">สถาบัน
          <select id="ob-school">
            <option value="">— เลือก —</option>
            ${D.SCHOOLS.map((s) => `<option value="${s.id}"${s.id === p.schoolId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field${p.schoolId === 'other' ? '' : ' hidden'}" id="ob-other-wrap">ชื่อสถาบัน
          <input id="ob-other" maxlength="60" value="${esc(p.schoolOther)}" />
        </label>
        <label class="field">${unitLabel()} (ไม่บังคับ)
          <input id="ob-unit" maxlength="30" value="${esc(p.unit)}" placeholder="${unitLabel() === 'คณะ' ? 'เช่น วิศวะ, นิเทศ' : 'เช่น ม.4/2'}" />
        </label>
        <button class="btn primary big" data-action="ob-next">ต่อไป</button>`;
    } else if (step === 3) {
      body = `
        <h2>ชอบขยับแบบไหน?</h2>
        <p class="muted">เลือกได้หลายอย่าง ไม่ต้องมีอุปกรณ์ก็ได้</p>
        <div class="chips">
          ${D.ACTIVITIES.map((a) => `<button class="chip${p.interests.includes(a.id) ? ' on' : ''}" data-action="ob-interest" data-v="${a.id}">${a.emoji} ${esc(a.name)}</button>`).join('')}
        </div>
        <p class="label">ตอนนี้ขยับบ่อยแค่ไหน?</p>
        <div class="chips">
          ${D.LEVELS.map((l) => `<button class="chip${p.level === l.id ? ' on' : ''}" data-action="ob-level" data-v="${l.id}">${esc(l.name)}</button>`).join('')}
        </div>
        <p class="label">ช่วงไหนว่างที่สุด?</p>
        <div class="chips">
          ${D.FREE_TIMES.map((t) => `<button class="chip${p.freeTime === t.id ? ' on' : ''}" data-action="ob-time" data-v="${t.id}">${esc(t.name)}</button>`).join('')}
        </div>
        <button class="btn primary big" data-action="ob-next">ต่อไป</button>`;
    } else {
      body = `
        <h2>ตั้งใจไว้แค่ไหนดี?</h2>
        <p class="muted">เริ่มน้อยๆ ก่อนได้ ปรับทีหลังได้ตลอด</p>
        <p class="label">วันละกี่นาที</p>
        <div class="chips">
          ${[10, 15, 20, 30].map((m) => `<button class="chip${p.minutes === m ? ' on' : ''}" data-action="ob-minutes" data-v="${m}">${m} นาที</button>`).join('')}
        </div>
        <p class="label">สัปดาห์ละกี่วัน</p>
        <div class="chips">
          ${[3, 4, 5, 6, 7].map((d) => `<button class="chip${p.daysPerWeek === d ? ' on' : ''}" data-action="ob-days" data-v="${d}">${d} วัน</button>`).join('')}
        </div>
        <div class="note">❄️ มี <b>Streak Freeze</b> สัปดาห์ละ ${L.FREEZES_PER_WEEK} วัน พลาดได้โดย streak ไม่หาย</div>
        <div class="note">👻 <b>โหมดไม่มีใครเห็น</b> จะเปิดให้อัตโนมัติ ${L.INVISIBLE_DAYS} วันแรก</div>
        <button class="btn primary big" data-action="ob-finish">เข้าสู่ห้องของฉัน 🏠</button>`;
    }

    app.innerHTML = `
      <main class="onboard">
        ${step > 0 ? '<button class="back" data-action="ob-back" aria-label="ย้อนกลับ">‹</button>' : ''}
        <div class="dots">${dots}</div>
        ${body}
      </main>`;
  }

  function readOnboardInputs() {
    const p = state.profile;
    const nick = document.getElementById('ob-nick');
    if (nick) p.nickname = nick.value.trim();
    const school = document.getElementById('ob-school');
    if (school) p.schoolId = school.value;
    const other = document.getElementById('ob-other');
    if (other) p.schoolOther = other.value.trim();
    const unit = document.getElementById('ob-unit');
    if (unit) p.unit = unit.value.trim();
  }

  function validateStep() {
    const p = state.profile;
    if (state.onboardStep === 1 && !p.nickname) return 'ใส่ชื่อเล่นก่อนนะ';
    if (state.onboardStep === 2 && !p.schoolId) return 'เลือกสถาบันก่อนนะ';
    if (state.onboardStep === 2 && p.schoolId === 'other' && !p.schoolOther) return 'พิมพ์ชื่อสถาบันก่อนนะ';
    if (state.onboardStep === 3 && p.interests.length === 0) return 'เลือกอย่างน้อย 1 กิจกรรม';
    return null;
  }

  // ---------- main shell ----------

  const TABS = [
    { id: 'home', name: 'วันนี้', icon: '☀️' },
    { id: 'room', name: 'มินิรูม', icon: '🏠' },
    { id: 'season', name: 'ซีซั่น', icon: '🏆' },
    { id: 'friends', name: 'เพื่อน', icon: '🤝' },
    { id: 'me', name: 'ฉัน', icon: '🌱' },
  ];

  function renderMain() {
    const s = streak();
    maybeAskExitSurvey(s);
    state.lastSeenStreak = s.count;
    awardAchievements(s);
    save();

    const views = { home: viewHome, room: viewRoom, season: viewSeason, friends: viewFriends, me: viewMe };
    app.innerHTML = `
      <header class="topbar">
        <div class="who"><span class="mini-avatar">${state.profile.avatar}</span>${esc(state.profile.nickname)}</div>
        <div class="stats">
          <span title="Streak">🔥 ${s.count}</span>
          <span title="เหรียญ">🪙 ${state.coins}</span>
        </div>
      </header>
      <main class="content">${views[state.tab](s)}</main>
      <nav class="tabbar">
        ${TABS.map((t) => `<button class="tab${state.tab === t.id ? ' on' : ''}" data-action="tab" data-v="${t.id}"><span>${t.icon}</span>${t.name}</button>`).join('')}
      </nav>`;
  }

  function render() {
    if (state.onboarded) renderMain();
    else renderOnboarding();
  }

  // ---------- home ----------

  function viewHome(s) {
    const lv = L.levelFor(state.xp);
    const t = today();
    const checkin = state.checkins[t];
    const invisibleLeft = L.invisibleDaysLeft(state.invisibleUntil, t);
    const groupInfo = state.group ? L.groupStreak(state.checkins, peopleFor(state.group.members), state.group.createdKey, t) : null;
    const weekDays = Array.from({ length: 7 }, (_, i) => L.addDays(L.weekKey(t), i));
    const doneThisWeek = weekDays.filter((k) => state.checkins[k]).length;

    let banner = '';
    if (state.visibility === 'self' && invisibleLeft > 0) {
      banner = `<div class="banner ghost">👻 โหมดไม่มีใครเห็นเปิดอยู่ (อีก ${invisibleLeft} วัน)<br/><small>XP และ streak ยังสะสมตามปกติ แค่ยังไม่มีใครเห็นคุณ</small></div>`;
    } else if (state.visibility === 'self' && !state.revealPromptDismissed) {
      banner = `<div class="banner">พร้อมให้กลุ่มเพื่อนสนิทเห็น streak และมินิรูมหรือยัง? 🌷
        <div class="row"><button class="btn small primary" data-action="reveal-friends">ให้เพื่อนสนิทเห็น</button>
        <button class="btn small" data-action="reveal-later">ยังก่อน</button></div></div>`;
    }

    const checkCard = checkin
      ? `<section class="card done">
          <div class="big-emoji">${byId(D.ACTIVITIES, checkin.activity).emoji}</div>
          <h2>วันนี้ขยับแล้ว!</h2>
          <p>${esc(checkin.message)}</p>
          <p class="muted">+${checkin.xp} XP · +${checkin.coins} 🪙 ${checkin.mood ? '· ' + byId(D.MOODS, checkin.mood).emoji : ''}</p>
        </section>`
      : `<section class="card cta">
          <p class="muted">เป้าวันนี้: ขยับ ${state.profile.minutes} นาที แบบไหนก็ได้</p>
          <button class="btn primary big" data-action="open-checkin">✅ เช็คอินวันนี้</button>
          <p class="muted small">ทำได้บางส่วนก็นับนะ ไม่ต้องสมบูรณ์แบบ</p>
        </section>`;

    return `
      ${banner}
      ${checkCard}
      <section class="card">
        <div class="row between"><h3>🔥 Streak ${s.count} วัน</h3><span class="pill">❄️ เหลือ ${s.freezesLeftThisWeek}/${L.FREEZES_PER_WEEK}</span></div>
        <div class="week">
          ${weekDays
            .map((k) => {
              const cls = state.checkins[k] ? 'on' : s.frozenDays.includes(k) ? 'frozen' : k === t ? 'today' : '';
              const label = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'][weekDays.indexOf(k)];
              return `<div class="day ${cls}"><span>${state.checkins[k] ? '✓' : s.frozenDays.includes(k) ? '❄️' : ''}</span>${label}</div>`;
            })
            .join('')}
        </div>
        <p class="muted small">สัปดาห์นี้ ${doneThisWeek}/${state.profile.daysPerWeek} วันตามที่ตั้งใจ ${doneThisWeek >= state.profile.daysPerWeek ? '🎉 ครบแล้ว!' : ''}</p>
      </section>
      <section class="card">
        <div class="row between"><h3>Lv.${lv.level} ${esc(lv.title)}</h3><span class="muted small">${lv.into}/${lv.need} XP</span></div>
        <div class="bar"><div style="width:${(lv.into / lv.need) * 100}%"></div></div>
      </section>
      ${
        groupInfo
          ? `<section class="card link" data-action="tab" data-v="friends">
              <h3>👯 ${esc(state.group.name)}</h3>
              <p>Group streak <b>${groupInfo.count} วัน</b> · วันนี้ต้องมีคนเช็คอิน ${groupInfo.need}/${groupInfo.total} คน</p>
            </section>`
          : `<section class="card link" data-action="tab" data-v="friends">
              <h3>🤝 ยังไม่มีกลุ่มเพื่อนสนิท</h3>
              <p class="muted">สร้างกลุ่ม 5–10 คน หรือให้เราหาบัดดี้จากสถาบันเดียวกันให้</p>
            </section>`
      }
      ${homeSeasonCard(t)}`;
  }

  function openCheckin() {
    const p = state.profile;
    const acts = p.interests.length ? D.ACTIVITIES.filter((a) => p.interests.includes(a.id)).concat(D.ACTIVITIES.filter((a) => !p.interests.includes(a.id))) : D.ACTIVITIES;
    openModal(`
      <h2>วันนี้ขยับอะไรไป?</h2>
      <div class="chips" id="ci-acts">
        ${acts.map((a, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-action="ci-act" data-v="${a.id}">${a.emoji} ${esc(a.name)}</button>`).join('')}
      </div>
      <p class="label">ทำได้ตามที่ตั้งใจไหม? (${p.minutes} นาที)</p>
      <div class="chips" id="ci-kind">
        <button class="chip on" data-action="ci-kind" data-v="full">ครบตามที่ตั้งใจ 🎯</button>
        <button class="chip" data-action="ci-kind" data-v="partial">ได้นิดหน่อยก็ยังดี 🌱</button>
      </div>
      <p class="label">รู้สึกยังไงบ้าง? (ไม่บังคับ)</p>
      <div class="chips" id="ci-mood">
        ${D.MOODS.map((m) => `<button class="chip" data-action="ci-mood" data-v="${m.id}">${m.emoji} ${esc(m.name)}</button>`).join('')}
      </div>
      <button class="btn primary big" data-action="ci-submit">บันทึก</button>`);
  }

  // Single-select chip row; an optional row can be cleared by tapping the active chip.
  function pickChip(btn, optional) {
    const wasOn = btn.classList.contains('on');
    btn.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
    if (!(optional && wasOn)) btn.classList.add('on');
  }

  function submitCheckin() {
    const sel = (id) => {
      const el = document.querySelector('#' + id + ' .chip.on');
      return el ? el.dataset.v : null;
    };
    const t = today();
    if (state.checkins[t]) return closeModal();
    const before = streak().count;
    const kind = sel('ci-kind') || 'full';
    const reward = L.rewardFor(kind, before);
    const message = D.ENCOURAGEMENTS[Math.floor(L.seededRandom(t + state.profile.nickname) * D.ENCOURAGEMENTS.length)];
    state.checkins[t] = { activity: sel('ci-acts') || 'walk', kind, mood: sel('ci-mood'), xp: reward.xp, coins: reward.coins, message };
    const prevLevel = L.levelFor(state.xp).level;
    state.xp += reward.xp;
    state.coins += reward.coins;
    const after = streak().count;
    const unlocked = D.ITEMS.concat(D.ACCESSORIES).filter((i) => i.unlock && after >= i.unlock.streak && !state.owned.includes(i.id));
    unlocked.forEach((i) => state.owned.push(i.id));
    save();
    closeModal();
    render();
    const lv = L.levelFor(state.xp);
    if (unlocked.length) toast('ปลดล็อก ' + unlocked.map((i) => i.emoji + ' ' + i.name).join(', ') + '!');
    else if (lv.level > prevLevel) toast('เลเวลอัป! Lv.' + lv.level + ' ' + lv.title + ' 🎉');
    else toast(message);
  }

  // ---------- exit survey (listen to the people who stop) ----------

  function maybeAskExitSurvey(s) {
    const t = today();
    const prev = state.lastSeenStreak;
    if (s.count === 0 && prev >= 2 && !state.surveys.some((x) => x.key === t)) {
      setTimeout(() => {
        openModal(`
          <div class="hero">💛</div>
          <h2>ไม่เป็นไรเลยนะ พักได้</h2>
          <p class="muted">streak ${prev} วันที่ผ่านมาไม่ได้หายไปไหน มันคือสิ่งที่คุณทำได้จริง<br/>อยากบอกเราไหมว่าช่วงนี้เป็นยังไงบ้าง? (ไม่บังคับ)</p>
          <div class="chips">${D.EXIT_REASONS.map((r) => `<button class="chip" data-action="survey" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>
          <button class="btn" data-action="survey" data-v="">ข้ามไปก่อน</button>`);
      }, 50);
      state.surveys.push({ key: t, reason: null, streak: prev });
    }
  }

  // ---------- mini room ----------

  function roomHtml(placed, theme, avatar, acc, badge) {
    const th = theme ? byId(D.ITEMS, theme).theme : { wall: '#fdf0f6', floor: '#f3d9e6' };
    const accItem = byId(D.ACCESSORIES, acc);
    return `
      <div class="room" style="--wall:${th.wall};--floor:${th.floor}">
        <div class="wall"></div><div class="floor"></div>
        ${placed
          .map((id) => byId(D.ITEMS, id))
          .filter((i) => i && !i.theme)
          .map((i) => `<span class="item" style="left:${i.x}%;top:${i.y}%;font-size:${i.size}rem" title="${esc(i.name)}">${i.emoji}</span>`)
          .join('')}
        ${badge ? `<span class="badge">${esc(badge)}</span>` : ''}
        <span class="me" style="left:52%;top:40%">${accItem && accItem.emoji ? `<span class="acc">${accItem.emoji}</span>` : ''}${avatar}</span>
      </div>`;
  }

  function viewRoom() {
    const visibleTo = { self: 'เฉพาะคุณ 👻', friends: 'กลุ่มเพื่อนสนิท', class: unitLabel() + 'และเพื่อนสนิท', school: 'ทั้งโรงเรียน' }[state.visibility];
    // Season exclusives only appear once earned from the Battle Pass.
    const shopItems = D.ITEMS.concat(D.ACCESSORIES.filter((a) => a.id !== 'none')).filter((i) => !i.season || state.owned.includes(i.id));
    return `
      <section class="card">
        <div class="row between"><h3>ห้องของ${esc(state.profile.nickname)}</h3><span class="pill">มองเห็นโดย: ${visibleTo}</span></div>
        ${roomHtml(state.placed, state.theme, state.profile.avatar, state.acc, schoolBadge())}
        <p class="muted small">ขยับครบ = ได้เหรียญมาแต่งห้อง แต่งเสร็จแคปไปลงสตอรี่ได้เลย 📸</p>
      </section>
      <div class="seg two">
        <button class="${state.roomView === 'decor' ? 'on' : ''}" data-action="room-view" data-v="decor">🛋️ ของแต่ง</button>
        <button class="${state.roomView === 'coupons' ? 'on' : ''}" data-action="room-view" data-v="coupons">🎁 คูปองร้านค้า</button>
      </div>
      ${state.roomView === 'coupons' ? viewCoupons() : viewShop(shopItems)}`;
  }

  function viewShop(shopItems) {
    return `
      <section class="card">
        <h3>ของในห้อง & ร้านค้า</h3>
        <p class="muted small">ขายแค่ของแต่ง ไม่มีของที่ทำให้ได้ XP เร็วขึ้น — แฟร์กับทุกคน</p>
        <div class="shop">
          ${shopItems
            .map((i) => {
              const owned = state.owned.includes(i.id);
              const isAcc = Boolean(byId(D.ACCESSORIES, i.id));
              const active = isAcc ? state.acc === i.id : i.theme ? state.theme === i.id : state.placed.includes(i.id);
              let btn;
              if (owned) btn = `<button class="btn small${active ? ' primary' : ''}" data-action="toggle-item" data-v="${i.id}">${active ? 'ใช้อยู่' : 'ใช้'}</button>`;
              else if (i.unlock) btn = `<span class="pill">🔒 streak ${i.unlock.streak}</span>`;
              else btn = `<button class="btn small" data-action="buy" data-v="${i.id}"${state.coins < i.cost ? ' disabled' : ''}>🪙 ${i.cost}</button>`;
              return `<div class="shop-item"><span class="shop-emoji">${i.emoji}</span><span class="shop-name">${esc(i.name)}</span>${btn}</div>`;
            })
            .join('')}
        </div>
      </section>`;
  }

  function buy(id) {
    const item = byId(D.ITEMS, id) || byId(D.ACCESSORIES, id);
    if (!item || state.owned.includes(id) || state.coins < item.cost) return;
    state.coins -= item.cost;
    state.owned.push(id);
    toggleItem(id);
    toast('ได้ ' + item.emoji + ' ' + item.name + ' แล้ว!');
  }

  function toggleItem(id) {
    if (byId(D.ACCESSORIES, id)) state.acc = state.acc === id ? 'none' : id;
    else if (byId(D.ITEMS, id).theme) state.theme = state.theme === id ? null : id;
    else if (state.placed.includes(id)) state.placed = state.placed.filter((x) => x !== id);
    else state.placed.push(id);
    save();
    render();
  }

  // ---------- friends: close-friends group + buddy matching ----------

  function memberRow(person, t) {
    const done = L.mockChecked(person, t);
    return `
      <div class="member">
        <span class="mini-avatar">${person.avatar}</span>
        <div class="grow"><b>${esc(person.name)}</b><br/><small class="muted">🔥 ${L.mockStreak(person, t)} วัน · ${done ? 'ขยับแล้ว ✓' : 'ยังไม่ขยับ'}</small></div>
        <button class="btn small" data-action="cheer" data-v="${esc(person.name)}">💌 เชียร์</button>
        <button class="btn small ghost-btn" data-action="visit" data-v="${esc(person.name)}" aria-label="เยี่ยมห้อง">🏠</button>
      </div>`;
  }

  function viewFriends() {
    const t = today();
    const parts = [];

    if (state.visibility === 'self') {
      parts.push(`<div class="banner ghost">👻 ตอนนี้เพื่อนยังไม่เห็น streak และมินิรูมของคุณ แต่คุณส่งกำลังใจให้เพื่อนได้ตามปกติ
        <div class="row"><button class="btn small" data-action="tab" data-v="me">ตั้งค่าการมองเห็น</button></div></div>`);
    }

    if (state.group) {
      const members = peopleFor(state.group.members).filter((m) => !state.blocked.includes(m.name));
      const g = L.groupStreak(state.checkins, members, state.group.createdKey, t);
      parts.push(`
        <section class="card">
          <div class="row between"><h3>👯 ${esc(state.group.name)}</h3><span class="pill">${members.length + 1}/10 คน</span></div>
          <p>Group streak <b>${g.count} วัน</b> ${g.countsToday ? '— วันนี้ผ่านแล้ว 🎉' : `— วันนี้ต้องเช็คอินอีก ${Math.max(0, g.need - (state.checkins[t] ? 1 : 0) - members.filter((m) => L.mockChecked(m, t)).length)} คน`}</p>
          <p class="muted small">streak รวมจะไปต่อเมื่อเพื่อนครึ่งหนึ่งขยับในวันนั้น ช่วยกันรักษานะ</p>
          <div class="members">
            <div class="member"><span class="mini-avatar">${state.profile.avatar}</span><div class="grow"><b>${esc(state.profile.nickname)} (คุณ)</b><br/><small class="muted">🔥 ${streak().count} วัน · ${state.checkins[t] ? 'ขยับแล้ว ✓' : 'ยังไม่ขยับ'}</small></div></div>
            ${members.map((m) => memberRow(m, t)).join('')}
          </div>
          <p class="muted small">รหัสชวนเพื่อน: <b class="code">${esc(state.group.code)}</b></p>
          <button class="btn small" data-action="leave-group">ออกจากกลุ่ม</button>
        </section>`);
    } else {
      parts.push(`
        <section class="card">
          <h3>🤝 กลุ่มเพื่อนสนิท (5–10 คน)</h3>
          <p class="muted">เห็นแค่ในกลุ่ม ไม่มีฟีดสาธารณะ ไม่มีคนแปลกหน้า</p>
          <label class="field">ตั้งชื่อกลุ่ม<input id="group-name" maxlength="30" placeholder="เช่น แก๊ง ม.5/3 ขยับทุกวัน" /></label>
          <button class="btn primary" data-action="create-group">สร้างกลุ่ม</button>
          <hr/>
          <label class="field">มีรหัสจากเพื่อนแล้ว?<input id="group-code" maxlength="8" placeholder="เช่น AL-4821" /></label>
          <button class="btn" data-action="join-group">เข้าร่วมกลุ่ม</button>
        </section>`);
    }

    parts.push(viewBuddy(t));
    return parts.join('');
  }

  function viewBuddy(t) {
    const b = state.buddy;
    if (b) {
      const person = D.PEOPLE.find((p) => p.name === b.name);
      const daysIn = L.diffDays(b.startKey, t);
      const trialLeft = Math.max(0, L.BUDDY_TRIAL_DAYS - daysIn);
      return `
        <section class="card">
          <h3>🫶 บัดดี้ของคุณ</h3>
          ${memberRow(person, t)}
          ${
            b.status === 'trial'
              ? trialLeft > 0
                ? `<p class="muted small">ช่วงลองคุยกัน: เหลืออีก ${trialLeft} วัน ก่อนตัดสินใจผูก streak ร่วมกัน</p>`
                : `<p>ครบ ${L.BUDDY_TRIAL_DAYS} วันแล้ว อยากเป็นบัดดี้กันต่อไหม?</p>
                   <div class="row"><button class="btn small primary" data-action="buddy-link">ผูก streak ร่วมกัน</button>
                   <button class="btn small" data-action="buddy-end">ไม่เป็นไร ขอบคุณนะ</button></div>`
              : '<p class="muted small">ผูก streak ร่วมกันแล้ว 💞 ข้อมูลติดต่อแลกกันได้เพราะทั้งคู่ยืนยันแล้ว</p>'
          }
          <p class="muted small">🔒 ไม่แชร์ข้อมูลติดต่อส่วนตัวจนกว่าทั้งคู่ยืนยัน</p>
          <button class="btn small danger" data-action="buddy-report">รายงาน / บล็อก</button>
        </section>`;
    }
    return `
      <section class="card">
        <h3>🫶 หาบัดดี้ขยับด้วยกัน</h3>
        <p class="muted">ยังไม่มีเพื่อนมาด้วย? เราจับคู่ให้จากสถาบันเดียวกัน ดูจากระดับการขยับ เวลาว่าง และกิจกรรมที่ชอบ — ไม่ดูรูปร่างหน้าตา</p>
        <button class="btn primary" data-action="find-buddy">หาบัดดี้ให้หน่อย</button>
      </section>`;
  }

  function findBuddy() {
    const taken = state.group ? state.group.members : [];
    const candidates = D.PEOPLE.filter((p) => !state.blocked.includes(p.name) && !taken.includes(p.name))
      .map((p) => Object.assign({ person: p }, L.buddyScore(state.profile, p)))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (!candidates.length) return toast('ตอนนี้ยังไม่มีคนที่เหมาะ ลองใหม่พรุ่งนี้นะ');
    openModal(`
      <h2>บัดดี้ที่น่าจะเข้ากัน</h2>
      <p class="muted small">ทุกคนอยู่ ${esc(schoolName())} · ลองคุยกัน ${L.BUDDY_TRIAL_DAYS} วันก่อน ไม่ถูกคอก็แยกกันได้ไม่ต้องเกรงใจ</p>
      ${candidates
        .map(
          (c) => `
        <div class="member">
          <span class="mini-avatar">${c.person.avatar}</span>
          <div class="grow"><b>${esc(c.person.name)}</b><br/><small class="muted">${c.shared.map((id) => byId(D.ACTIVITIES, id).emoji + ' ' + byId(D.ACTIVITIES, id).name).concat(c.reasons).join(' · ') || 'อยากลองขยับเหมือนกัน'}</small></div>
          <button class="btn small primary" data-action="pick-buddy" data-v="${esc(c.person.name)}">ลองคุย</button>
        </div>`
        )
        .join('')}`);
  }

  function visitRoom(name) {
    const p = D.PEOPLE.find((x) => x.name === name);
    openModal(`
      <h2>ห้องของ${esc(p.name)}</h2>
      ${roomHtml(p.items, null, p.avatar, 'none')}
      <div class="chips">${D.CHEERS.map((c) => `<button class="chip" data-action="cheer-msg" data-to="${esc(p.name)}" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>`);
  }

  function openCheer(name) {
    openModal(`
      <h2>ส่งกำลังใจให้${esc(name)}</h2>
      <p class="muted small">ข้อความสำเร็จรูปเท่านั้น เพื่อให้ทุกคนปลอดภัย</p>
      <div class="chips">${D.CHEERS.map((c) => `<button class="chip" data-action="cheer-msg" data-to="${esc(name)}" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>`);
  }

  // ---------- season: Battle Pass, School League, collectible cards ----------

  function playerStats(s) {
    const list = Object.values(state.checkins);
    return {
      total: list.length,
      partial: list.filter((c) => c.kind === 'partial').length,
      bestStreak: state.bestStreak,
      freezeUsed: state.freezeUsed ? 1 : 0,
      activities: new Set(list.map((c) => c.activity)).size,
      group: state.group ? 1 : 0,
      buddy: state.buddy ? 1 : 0,
      cheers: state.cheersSent,
      revealed: state.revealed ? 1 : 0,
    };
  }

  function awardAchievements(s) {
    state.bestStreak = Math.max(state.bestStreak, s.count);
    if (s.frozenDays.length) state.freezeUsed = true;
    if (state.visibility !== 'self') state.revealed = true;
    const fresh = L.achievementsEarned(D.ACHIEVEMENTS, playerStats(s)).filter((id) => !state.cards[id]);
    fresh.forEach((id) => {
      state.cards[id] = 1;
      const a = byId(D.ACHIEVEMENTS, id);
      setTimeout(() => toast('ได้การ์ดใหม่ ' + a.emoji + ' ' + a.name + '!'), 300);
    });
  }

  function weekXp() {
    return L.xpBetween(state.checkins, L.weekKey(today()), today());
  }

  function leagueRows() {
    const schools = D.SCHOOLS.filter((x) => x.id !== 'other');
    if (state.profile.schoolId === 'other') schools.push({ id: 'other', name: schoolName() });
    return L.schoolLeague(schools, state.profile.schoolId, weekXp(), state.visibility === 'school', today());
  }

  function schoolBadge() {
    if (state.visibility !== 'school') return '';
    const mine = leagueRows().find((r) => r.mine);
    return mine ? '🏫 #' + mine.rank : '';
  }

  function confirmSchoolVisibility() {
    return confirm('เปิดให้ทั้งโรงเรียนเห็น?\n\nคนในโรงเรียนจะเห็นชื่อเล่นและมินิรูมของคุณ และ XP ของคุณจะถูกนับเข้า School League (อันดับเป็นของโรงเรียน ไม่มีอันดับรายบุคคล)\nเปลี่ยนกลับได้ตลอด');
  }

  function passState() {
    const season = L.seasonFor(today());
    if (!state.pass || state.pass.season !== season.number) {
      state.pass = { season: season.number, premium: false, claimedFree: [], claimedPremium: [] };
    }
    if (!state.priceVariant) state.priceVariant = D.PASS_PRICES[Math.floor(Math.random() * D.PASS_PRICES.length)];
    return state.pass;
  }

  function rewardLabel(r) {
    if (r.coins) return '🪙 ' + r.coins;
    if (r.pack) return '🃏 การ์ด ' + r.pack + ' แพ็ก';
    const item = byId(D.ITEMS, r.item) || byId(D.ACCESSORIES, r.item);
    return item.emoji + ' ' + item.name;
  }

  function homeSeasonCard(t) {
    const season = L.seasonFor(t);
    const tier = L.tierFor(L.xpBetween(state.checkins, season.startKey, t));
    const mine = leagueRows().find((r) => r.mine);
    return `
      <section class="card soon link" data-action="tab" data-v="season">
        <div class="row between"><h3>🏆 ซีซั่น ${season.number}</h3><span class="pill">เหลือ ${season.daysLeft} วัน</span></div>
        <p class="small">Battle Pass tier <b>${tier.tier}/${L.MAX_TIER}</b> · ${esc(schoolName())} อันดับ <b>#${mine ? mine.rank : '-'}</b> สัปดาห์นี้</p>
        <p class="muted small">${state.visibility === 'school' ? 'XP ของคุณช่วยโรงเรียนอยู่ 💪' : 'XP ของคุณยังไม่ถูกนับเข้า League (ตั้งค่าได้ในแท็บ ฉัน)'}</p>
      </section>`;
  }

  function viewSeason() {
    const seg = [
      ['pass', '🎟️ Pass'],
      ['league', '🏫 League'],
      ['tournament', '⚔️ ทัวร์'],
      ['cards', '🃏 การ์ด'],
    ];
    const views = { pass: viewPass, league: viewLeague, tournament: viewTournament, cards: viewCards };
    return `
      <div class="seg four">${seg.map(([v, n]) => `<button class="${state.seasonView === v ? 'on' : ''}" data-action="season-view" data-v="${v}">${n}</button>`).join('')}</div>
      ${views[state.seasonView]()}`;
  }

  function viewPass() {
    const t = today();
    const pass = passState();
    const season = L.seasonFor(t);
    const sxp = L.xpBetween(state.checkins, season.startKey, t);
    const tier = L.tierFor(sxp);
    const cell = (track, i) => {
      const r = (track === 'free' ? D.PASS_FREE : D.PASS_PREMIUM)[i];
      const claimed = (track === 'free' ? pass.claimedFree : pass.claimedPremium).includes(i);
      const reached = tier.tier > i;
      const locked = track === 'premium' && !pass.premium;
      let action = '';
      if (claimed) action = '<span class="pill">รับแล้ว ✓</span>';
      else if (reached && !locked) action = `<button class="btn small primary" data-action="claim" data-v="${track}:${i}">รับ</button>`;
      else action = `<span class="pill muted-pill">${locked ? '🔒' : 'tier ' + (i + 1)}</span>`;
      return `<div class="tier-cell${reached ? ' reached' : ''}${claimed ? ' claimed' : ''}"><span>${rewardLabel(r)}</span>${action}</div>`;
    };
    const claimable = D.PASS_FREE.some((_, i) => tier.tier > i && !pass.claimedFree.includes(i)) || (pass.premium && D.PASS_PREMIUM.some((_, i) => tier.tier > i && !pass.claimedPremium.includes(i)));
    return `
      <section class="card">
        <div class="row between"><h3>Battle Pass ซีซั่น ${season.number}</h3><span class="pill">เหลือ ${season.daysLeft} วัน</span></div>
        <p class="small">Tier <b>${tier.tier}/${L.MAX_TIER}</b> · Season XP ${sxp}</p>
        <div class="bar"><div style="width:${(tier.into / tier.need) * 100}%"></div></div>
        <p class="muted small">ได้ XP จากการเช็คอินเท่านั้น ซื้อ XP ไม่ได้ — Premium เป็นของแต่งล้วนๆ</p>
        ${claimable ? '<button class="btn primary" data-action="claim-all">รับรางวัลทั้งหมด</button>' : ''}
      </section>
      ${
        pass.premium
          ? ''
          : `<section class="card premium-cta">
              <h3>✨ Premium Pass ${state.priceVariant} บาท</h3>
              <p class="small">ปลดล็อกแถว Premium: ธีมซากุระ ตุ๊กตาหมี ดอกไม้ทัดหู และแพ็กการ์ดเพิ่ม ใช้ได้ทั้งซีซั่น ${L.SEASON_DAYS} วัน</p>
              <button class="btn primary" data-action="buy-pass">ดู Premium</button>
            </section>`
      }
      <section class="card">
        <div class="tiers-head"><span>ฟรี</span><span>Premium ${pass.premium ? '✨' : '🔒'}</span></div>
        <div class="tiers">
          ${D.PASS_FREE.map((_, i) => `<div class="tier-row"><b class="tier-no">${i + 1}</b>${cell('free', i)}${cell('premium', i)}</div>`).join('')}
        </div>
      </section>`;
  }

  function grant(r, seed) {
    if (r.coins) state.coins += r.coins;
    if (r.item && !state.owned.includes(r.item)) state.owned.push(r.item);
    if (!r.pack) return [];
    return L.openPack(D.PHOTOCARDS, seed, 3 * r.pack).map((id) => {
      const isNew = !state.cards[id];
      state.cards[id] = (state.cards[id] || 0) + 1;
      return { id, isNew };
    });
  }

  function claim(keys) {
    const pass = passState();
    let cards = [];
    const labels = [];
    keys.forEach(([track, i]) => {
      const list = track === 'free' ? pass.claimedFree : pass.claimedPremium;
      if (list.includes(i)) return;
      list.push(i);
      const r = (track === 'free' ? D.PASS_FREE : D.PASS_PREMIUM)[i];
      labels.push(rewardLabel(r));
      cards = cards.concat(grant(r, [state.profile.nickname, pass.season, track, i].join('|')));
    });
    save();
    render();
    if (cards.length) showPack(cards);
    else if (labels.length) toast('ได้ ' + labels.join(', '));
  }

  function claimAll() {
    const pass = passState();
    const tier = L.tierFor(L.xpBetween(state.checkins, L.seasonFor(today()).startKey, today())).tier;
    const keys = [];
    for (let i = 0; i < tier; i++) {
      keys.push(['free', i]);
      if (pass.premium) keys.push(['premium', i]);
    }
    claim(keys);
  }

  function showPack(pulled) {
    openModal(`
      <h2>เปิดแพ็กการ์ด! 🃏</h2>
      <div class="cards pack">
        ${pulled
          .map((p, i) => {
            const c = byId(D.PHOTOCARDS, p.id);
            return `<div class="pcard ${c.rarity}" style="animation-delay:${i * 0.12}s"><span class="pcard-emoji">${c.emoji}</span><b>${esc(c.name)}</b><small>${D.RARITY[c.rarity]} · ${p.isNew ? 'ใหม่!' : 'ซ้ำ'}</small></div>`;
          })
          .join('')}
      </div>
      <p class="muted small">การ์ดซ้ำเอาไปแลกกับเพื่อนในแก๊งได้ที่แท็บการ์ด</p>
      <button class="btn primary big" data-action="close-modal">เก็บเข้าอัลบั้ม</button>`);
  }

  function openBuyPass() {
    state.fakeDoor.buyClicks++;
    save();
    openModal(`
      <h2>✨ Premium Pass ซีซั่น ${state.pass.season}</h2>
      <p>${state.priceVariant} บาท จ่ายครั้งเดียวทั้งซีซั่น ไม่ใช่รายเดือน</p>
      <ul class="promise">
        ${D.PASS_PREMIUM.filter((r) => r.item).map((r) => `<li>${rewardLabel(r)}</li>`).join('')}
        <li>🃏 การ์ดเพิ่ม ${D.PASS_PREMIUM.reduce((n, r) => n + (r.pack || 0), 0)} แพ็ก</li>
      </ul>
      <p class="muted small">ไม่มี XP boost ไม่มีทางลัด — ทุกคนไต่ tier ด้วยความสม่ำเสมอเท่ากัน</p>
      <button class="btn primary big" data-action="pass-self">ซื้อเอง ${state.priceVariant} บาท</button>
      <button class="btn big" data-action="pass-parent">👨‍👩‍👧 ขอให้ผู้ปกครองซื้อให้</button>
      <button class="btn big ghost-btn" data-action="close-modal">ไว้ก่อน</button>`);
  }

  function unlockPremiumTrial(extra) {
    state.pass.premium = true;
    save();
    render();
    openModal(`
      <div class="hero">💛</div>
      <h2>ขอบคุณที่สนใจ!</h2>
      <p>นี่คือ prototype ยังไม่มีการเก็บเงินจริง เราปลดล็อก Premium ให้ทดลองฟรีตลอดซีซั่นนี้</p>
      ${extra || ''}
      <button class="btn primary big" data-action="close-modal">ไปรับรางวัล</button>`);
  }

  function parentMessage() {
    const total = Object.keys(state.checkins).length;
    return `ช่วยซื้อ Premium Pass ของแอป ActiveLift School ให้หน่อยได้ไหม (${state.priceVariant} บาท ครั้งเดียวทั้งซีซั่น) เป็นของแต่งห้องล้วนๆ ไม่มีทางลัด ตอนนี้ออกกำลังกายมาแล้ว ${total} วัน 💪`;
  }

  function viewLeague() {
    const rows = leagueRows();
    const mine = rows.find((r) => r.mine);
    const top = rows.slice(0, 8);
    if (mine && mine.rank > 8) top.push(mine);
    const max = rows[0].avg;
    const resetIn = 7 - L.diffDays(L.weekKey(today()), today());
    return `
      <section class="card">
        <div class="row between"><h3>🏫 School League</h3><span class="pill">รีเซ็ตใน ${resetIn} วัน</span></div>
        <p class="muted small">วัดจาก XP เฉลี่ยต่อสมาชิกในสัปดาห์นี้ โรงเรียนเล็กก็ชนะได้ ไม่มีอันดับรายบุคคล</p>
        <div class="league">
          ${top
            .map(
              (r) => `
            <div class="league-row${r.mine ? ' mine' : ''}">
              <span class="rank">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : '#' + r.rank}</span>
              <div class="grow"><b>${esc(r.name)}</b><div class="bar thin"><div style="width:${(r.avg / max) * 100}%"></div></div></div>
              <span class="small">${r.avg}</span>
            </div>`
            )
            .join('')}
        </div>
      </section>
      <section class="card">
        ${
          state.visibility === 'school'
            ? `<p>คุณช่วย ${esc(schoolName())} ไป <b>+${weekXp()} XP</b> สัปดาห์นี้ 💪</p><p class="muted small">ป้าย ${esc(schoolBadge())} แสดงอยู่ในมินิรูมของคุณ</p>`
            : `<p>XP ของคุณยังไม่ถูกนับเข้า League</p>
               <p class="muted small">ไม่เป็นไรเลย ค่อยเปิดตอนพร้อม XP และ streak ส่วนตัวยังสะสมตามปกติ</p>
               <button class="btn" data-action="join-league">นับ XP ของฉันให้โรงเรียน</button>`
        }
      </section>`;
  }

  function viewCards() {
    const ach = D.ACHIEVEMENTS;
    const pcs = D.PHOTOCARDS;
    const ownedPc = pcs.filter((c) => state.cards[c.id]).length;
    return `
      <section class="card">
        <div class="row between"><h3>การ์ดความสำเร็จ</h3><span class="pill">${ach.filter((a) => state.cards[a.id]).length}/${ach.length}</span></div>
        <p class="muted small">ได้จาก milestone ความสม่ำเสมอ ไม่ใช่จากรูปร่างหรือตัวเลขบนตาชั่ง</p>
        <div class="cards">
          ${ach
            .map((a) =>
              state.cards[a.id]
                ? `<div class="pcard ${a.rarity}"><span class="pcard-emoji">${a.emoji}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`
                : `<div class="pcard locked"><span class="pcard-emoji">🔒</span><b>???</b><small>${esc(a.desc)}</small></div>`
            )
            .join('')}
        </div>
      </section>
      <section class="card">
        <div class="row between"><h3>โฟโต้การ์ด</h3><span class="pill">${ownedPc}/${pcs.length}</span></div>
        <p class="muted small">ได้จากแพ็กใน Battle Pass · ใบซ้ำแลกกับเพื่อนในแก๊งได้</p>
        <div class="cards">
          ${pcs
            .map((c) => {
              const n = state.cards[c.id] || 0;
              if (!n) return `<div class="pcard locked"><span class="pcard-emoji">❔</span><b>???</b><small>${D.RARITY[c.rarity]}</small></div>`;
              return `<div class="pcard ${c.rarity}"><span class="pcard-emoji">${c.emoji}</span><b>${esc(c.name)}</b><small>${D.RARITY[c.rarity]}${n > 1 ? ' · x' + n : ''}</small>${n > 1 ? `<button class="btn small" data-action="trade" data-v="${c.id}">แลก</button>` : ''}</div>`;
            })
            .join('')}
        </div>
      </section>`;
  }

  function tradePartners() {
    const names = (state.group ? state.group.members : []).concat(state.buddy ? [state.buddy.name] : []);
    return peopleFor(names).filter((p) => !state.blocked.includes(p.name));
  }

  // Each friend offers one photocard you are missing, fixed per day.
  function tradeOffer(person, giveId) {
    const missing = D.PHOTOCARDS.filter((c) => !state.cards[c.id] && c.id !== giveId);
    if (!missing.length) return null;
    return missing[Math.floor(L.seededRandom(person.name + '|' + giveId + '|' + today()) * missing.length)];
  }

  function openTrade(giveId) {
    const give = byId(D.PHOTOCARDS, giveId);
    const partners = tradePartners();
    let body;
    if (!partners.length) {
      body = `<p class="muted">แลกได้เฉพาะกับเพื่อนในแก๊งหรือบัดดี้ ยังไม่มีเลย ลองสร้างกลุ่มก่อนนะ</p>
        <button class="btn primary" data-action="tab" data-v="friends">ไปหน้าเพื่อน</button>`;
    } else {
      body = partners
        .map((p) => {
          const offer = tradeOffer(p, giveId);
          return `<div class="member"><span class="mini-avatar">${p.avatar}</span>
            <div class="grow"><b>${esc(p.name)}</b><br/><small class="muted">${offer ? 'ให้ ' + offer.emoji + ' ' + esc(offer.name) : 'ไม่มีใบที่คุณยังขาด'}</small></div>
            ${offer ? `<button class="btn small primary" data-action="do-trade" data-v="${giveId}" data-to="${esc(p.name)}">แลก</button>` : ''}</div>`;
        })
        .join('');
    }
    openModal(`<h2>แลก ${give.emoji} ${esc(give.name)}</h2><p class="muted small">แลกเฉพาะใบซ้ำ ใบสุดท้ายของคุณจะอยู่กับคุณเสมอ</p>${body}`);
  }

  function doTrade(giveId, name) {
    const person = D.PEOPLE.find((p) => p.name === name);
    const offer = tradeOffer(person, giveId);
    if (!offer || (state.cards[giveId] || 0) < 2) return closeModal();
    state.cards[giveId]--;
    state.cards[offer.id] = 1;
    save();
    closeModal();
    render();
    toast('แลกกับ' + name + 'แล้ว ได้ ' + offer.emoji + ' ' + offer.name);
  }

  // ---------- Phase 3: inter-school tournament ----------

  function userTournamentDays(round) {
    return Object.keys(state.checkins).filter((k) => k >= round.startKey && k <= round.endKey).length;
  }

  function tournamentBracket(t) {
    const tour = L.tournamentFor(t);
    const seeds = D.TOURNAMENT_SCHOOLS.slice().sort((a, b) => L.seededRandom(a + '|seed|' + tour.season) - L.seededRandom(b + '|seed|' + tour.season));
    const counted = state.visibility === 'school';
    const score = (id, round) => {
      const user = id === state.profile.schoolId ? { counted, days: userTournamentDays(round) } : null;
      return L.tournamentScore({ id }, round, t, user);
    };
    return { tour, rounds: L.bracket(seeds, tour.rounds, t, score) };
  }

  function shortSchool(id) {
    return byId(D.SCHOOLS, id).name.replace(/^โรงเรียน|^มหาวิทยาลัย/, '').replace(/ \(.*\)$/, '');
  }

  function viewTournament() {
    const t = today();
    const { tour, rounds } = tournamentBracket(t);
    const partner = D.TOURNAMENT_SCHOOLS.includes(state.profile.schoolId);
    const parts = [];

    parts.push(`
      <section class="card">
        <div class="row between"><h3>⚔️ ศึกขยับข้ามโรงเรียน</h3><span class="pill">ซีซั่น ${tour.season}</span></div>
        <p class="muted small">แข่งแบบแพ้คัดออก 8 สถาบัน สัปดาห์ละรอบ (สัปดาห์ที่ 2–4 ของซีซั่น)<br/>คะแนน = % ของสมาชิกที่ขยับอย่างน้อย ${L.TOURNAMENT_MIN_DAYS} วันในสัปดาห์นั้น ทุกคนช่วยได้เท่ากัน ไม่ว่าจะเก่งแค่ไหน</p>
        ${tour.phase === 'upcoming' ? `<p>เริ่ม ${tour.startKey} (อีก ${L.diffDays(t, tour.startKey)} วัน) เตรียมชวนเพื่อนไว้เลย!</p>` : ''}
      </section>`);

    if (!partner) {
      parts.push(`
        <section class="card premium-cta">
          <h3>🏫 ${esc(schoolName())} ยังไม่ได้เข้าร่วม</h3>
          <p class="small">ทัวร์นาเมนต์จัดร่วมกับโรงเรียนที่เป็นพาร์ทเนอร์ ให้ครูพละหรือสโมสรนักเรียนสมัครให้ได้ ใช้ในวิชาพลศึกษาได้ด้วย</p>
          <button class="btn primary" data-action="invite-teacher">ชวนครูพละให้โรงเรียนเข้าร่วม</button>
        </section>`);
    } else if (tour.phase === 'live') {
      const live = rounds[rounds.length - 1];
      const round = tour.rounds[live.round];
      const days = userTournamentDays(round);
      const stillIn = live.matches.some((m) => m.a === state.profile.schoolId || m.b === state.profile.schoolId);
      parts.push(`
        <section class="card">
          <h3>สัปดาห์นี้: ${D.ROUND_NAMES[live.round]}</h3>
          ${
            !stillIn
              ? '<p>โรงเรียนของคุณตกรอบแล้ว ซีซั่นหน้าเอาใหม่! 💪 ยังเชียร์โรงเรียนอื่นได้นะ</p>'
              : state.visibility !== 'school'
                ? `<p class="small">การขยับของคุณจะนับให้โรงเรียนเมื่อเปิดการมองเห็นระดับโรงเรียน</p><button class="btn" data-action="join-league">นับให้โรงเรียนด้วย</button>`
                : `<p>คุณขยับไปแล้ว <b>${Math.min(days, L.TOURNAMENT_MIN_DAYS)}/${L.TOURNAMENT_MIN_DAYS}</b> วัน ${days >= L.TOURNAMENT_MIN_DAYS ? '— นับเป็น 1 คนให้โรงเรียนแล้ว ✓' : ''}</p>
                   <div class="bar"><div style="width:${(Math.min(days, L.TOURNAMENT_MIN_DAYS) / L.TOURNAMENT_MIN_DAYS) * 100}%"></div></div>`
          }
        </section>`);
    }

    rounds.forEach((r) => {
      parts.push(`
        <section class="card">
          <div class="row between"><h3>${D.ROUND_NAMES[r.round]}</h3><span class="pill">${r.finished ? 'จบแล้ว' : 'กำลังแข่ง'}</span></div>
          ${r.matches
            .map((m) => {
              const side = (id, sc) => `<div class="side${m.winner === id ? ' win' : ''}${id === state.profile.schoolId ? ' mine' : ''}"><span>${esc(shortSchool(id))}</span><b>${sc}%</b></div>`;
              return `<div class="match">${side(m.a, m.sa)}${side(m.b, m.sb)}</div>`;
            })
            .join('')}
        </section>`);
    });

    if (tour.phase === 'done') {
      const final = rounds[2].matches[0];
      const mine = final.winner === state.profile.schoolId;
      parts.push(`
        <section class="card center ${mine ? 'done' : ''}">
          <div class="hero">🏆</div>
          <h2>แชมป์ซีซั่น ${tour.season}: ${esc(shortSchool(final.winner))}</h2>
          <p class="muted">${mine ? 'โรงเรียนของคุณคือแชมป์! ทุกคนที่ขยับคือส่วนหนึ่งของชัยชนะนี้ 🎉' : 'ทัวร์นาเมนต์ใหม่เริ่มสัปดาห์ที่ 2 ของซีซั่นหน้า'}</p>
        </section>`);
    }
    return parts.join('');
  }

  function teacherMessage() {
    return `เรียนคุณครู นักเรียนอยากชวน ${schoolName()} เข้าร่วม “ศึกขยับข้ามโรงเรียน” ของแอป ActiveLift School ค่ะ/ครับ เป็นแอปออกกำลังกายที่ไม่วัดรูปร่างหรือน้ำหนัก วัดแค่ความสม่ำเสมอ ใช้ประกอบวิชาพลศึกษาได้ และโรงเรียนดูภาพรวมการขยับของนักเรียนได้`;
  }

  function openTeacherInvite() {
    state.fakeDoor.teacherInvites = (state.fakeDoor.teacherInvites || 0) + 1;
    save();
    const msg = teacherMessage();
    if (navigator.clipboard) navigator.clipboard.writeText(msg).catch(() => {});
    openModal(`
      <h2>ชวนครูพละ 🧑‍🏫</h2>
      <p class="muted small">ส่งข้อความนี้ให้ครูหรือสโมสรนักเรียน ทีมงานจะติดต่อกลับเพื่อจัดแข่งให้</p>
      <div class="note">${esc(msg)}</div>
      <p class="muted small">ขอบคุณที่ช่วยชวน! (prototype: นับไว้เป็นความสนใจของโรงเรียน)</p>
      <button class="btn primary big" data-action="close-modal">เรียบร้อย</button>`);
  }

  // ---------- Phase 3: local brand redemption ----------

  function viewCoupons() {
    const t = today();
    const coupons = state.coupons.slice().reverse();
    const can = L.canRedeem(state.coupons, t);
    const statusText = { active: 'ใช้ได้', used: 'ใช้แล้ว', expired: 'หมดอายุ' };
    return `
      <section class="card">
        <div class="row between"><h3>🎁 คูปองร้านใกล้โรงเรียน</h3><span class="pill">🪙 ${state.coins}</span></div>
        <p class="muted small">แลกเหรียญจากการขยับเป็นส่วนลดจริง สัปดาห์ละ 1 ใบ ใช้ได้ ${L.COUPON_DAYS} วัน · ร้านค้าพาร์ทเนอร์เป็นผู้ออกส่วนลด ไม่มีร้านยาลดน้ำหนัก/อาหารเสริมลดน้ำหนัก</p>
        ${can ? '' : '<div class="note">สัปดาห์นี้แลกไปแล้ว 1 ใบ แลกใหม่ได้วันจันทร์หน้า 🌱</div>'}
        <div class="partners">
          ${D.PARTNERS.map(
            (p) => `
            <div class="member">
              <span class="mini-avatar">${p.emoji}</span>
              <div class="grow"><b>${esc(p.offer)}</b><br/><small class="muted">${esc(p.name)}</small></div>
              <button class="btn small" data-action="redeem" data-v="${p.id}"${!can || state.coins < p.cost ? ' disabled' : ''}>🪙 ${p.cost}</button>
            </div>`
          ).join('')}
        </div>
      </section>
      ${
        coupons.length
          ? `<section class="card"><h3>คูปองของฉัน</h3>
              ${coupons
                .map((c) => {
                  const p = byId(D.PARTNERS, c.partnerId);
                  const st = L.couponStatus(c, t);
                  return `<div class="member coupon ${st}" data-action="${st === 'active' ? 'show-coupon' : ''}" data-v="${c.code}">
                    <span class="mini-avatar">${p.emoji}</span>
                    <div class="grow"><b>${esc(p.offer)}</b><br/><small class="muted">${esc(p.name)} · ${st === 'active' ? 'หมดอายุ ' + L.addDays(c.issuedKey, L.COUPON_DAYS - 1) : statusText[st]}</small></div>
                    <span class="pill">${statusText[st]}</span>
                  </div>`;
                })
                .join('')}
            </section>`
          : ''
      }`;
  }

  function redeem(partnerId) {
    const p = byId(D.PARTNERS, partnerId);
    const t = today();
    if (!p || state.coins < p.cost || !L.canRedeem(state.coupons, t)) return;
    if (!confirm('ใช้ ' + p.cost + ' เหรียญแลก “' + p.offer + '” ที่' + p.name + '?\nสัปดาห์นี้จะแลกได้แค่ใบนี้')) return;
    state.coins -= p.cost;
    const code = 'AL' + String(Math.floor(L.seededRandom(state.profile.nickname + t + partnerId) * 900000) + 100000);
    state.coupons.push({ partnerId, code, issuedKey: t, usedKey: null });
    save();
    render();
    showCoupon(code);
  }

  // Pseudo-QR made from the code so each coupon looks distinct.
  function qrHtml(code) {
    const cells = Array.from({ length: 81 }, (_, i) => {
      const r = Math.floor(i / 9);
      const c = i % 9;
      const corner = (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3);
      return `<span class="${corner || L.seededRandom(code + i) < 0.5 ? 'on' : ''}"></span>`;
    });
    return `<div class="qr">${cells.join('')}</div>`;
  }

  function showCoupon(code) {
    const c = state.coupons.find((x) => x.code === code);
    const p = byId(D.PARTNERS, c.partnerId);
    openModal(`
      <div class="coupon-ticket">
        <div class="hero">${p.emoji}</div>
        <h2>${esc(p.offer)}</h2>
        <p class="muted">${esc(p.name)}</p>
        ${qrHtml(c.code)}
        <p class="code big-code">${c.code}</p>
        <p class="muted small">ใช้ได้ถึง ${L.addDays(c.issuedKey, L.COUPON_DAYS - 1)} · ให้พนักงานสแกนหรือกดยืนยันที่หน้าร้าน</p>
      </div>
      <button class="btn primary big" data-action="use-coupon" data-v="${c.code}">พนักงานกดยืนยันการใช้</button>
      <button class="btn big ghost-btn" data-action="close-modal">ปิด</button>`);
  }

  // ---------- me / settings ----------

  function viewMe() {
    const t = today();
    const lv = L.levelFor(state.xp);
    const s = streak();
    const total = Object.keys(state.checkins).length;
    const days = Array.from({ length: 28 }, (_, i) => L.addDays(t, i - 27));
    return `
      <section class="card center">
        <div class="hero">${state.profile.avatar}</div>
        <h2>${esc(state.profile.nickname)}</h2>
        <p class="muted">${esc(schoolName())}${state.profile.unit ? ' · ' + esc(state.profile.unit) : ''}</p>
        <p>Lv.${lv.level} ${esc(lv.title)} · ${state.xp} XP</p>
      </section>
      <section class="card">
        <h3>พัฒนาการของฉัน 🌱</h3>
        <p class="muted small">วัดจากความสม่ำเสมอเท่านั้น ไม่มีการเทียบรูปร่าง</p>
        <div class="stat-row">
          <div><b>${total}</b><small>วันที่ขยับ</small></div>
          <div><b>${s.count}</b><small>streak ตอนนี้</small></div>
          <div><b>${state.cheersSent}</b><small>กำลังใจที่ส่ง</small></div>
        </div>
        <div class="heat">
          ${days.map((k) => `<span class="${state.checkins[k] ? (state.checkins[k].kind === 'full' ? 'full' : 'part') : s.frozenDays.includes(k) ? 'frozen' : ''}" title="${k}"></span>`).join('')}
        </div>
        <p class="muted small">28 วันล่าสุด · เข้ม = ครบตามตั้งใจ · อ่อน = ได้นิดหน่อย · ฟ้า = Streak Freeze</p>
      </section>
      <section class="card">
        <h3>ใครเห็นอะไรของฉันบ้าง</h3>
        <p class="muted small">ค่อยๆ เปิดทีละขั้นได้ตามที่พร้อม</p>
        ${[
          ['self', '👻 เฉพาะฉัน (โหมดไม่มีใครเห็น)'],
          ['friends', '👯 กลุ่มเพื่อนสนิท'],
          ['class', '🏫 ' + unitLabel() + 'ของฉัน'],
          ['school', '🏆 ทั้งโรงเรียน (นับเข้า School League)'],
        ]
          .map(([v, label]) => `<label class="radio"><input type="radio" name="vis" value="${v}" data-action="visibility"${state.visibility === v ? ' checked' : ''}/> ${label}</label>`)
          .join('')}
      </section>
      <section class="card">
        <h3>เป้าหมายของฉัน</h3>
        <div class="row between"><span>วันละ</span><select data-action="set-minutes">${[10, 15, 20, 30].map((m) => `<option${m === state.profile.minutes ? ' selected' : ''}>${m}</option>`).join('')}</select><span>นาที</span></div>
        <div class="row between"><span>สัปดาห์ละ</span><select data-action="set-days">${[3, 4, 5, 6, 7].map((d) => `<option${d === state.profile.daysPerWeek ? ' selected' : ''}>${d}</option>`).join('')}</select><span>วัน</span></div>
      </section>
      <section class="card dev">
        <h3>🧪 เครื่องมือทดสอบ prototype</h3>
        <p class="muted small">วันที่ในแอป: ${t}${state.dayOffset ? ` (ข้ามมา ${state.dayOffset} วัน)` : ''}</p>
        <div class="row wrap">
          <button class="btn small" data-action="next-day">⏭️ ข้ามไปวันถัดไป</button>
          <button class="btn small" data-action="export">⬇️ ส่งออกข้อมูลทดสอบ</button>
          <button class="btn small danger" data-action="reset">เริ่มใหม่ทั้งหมด</button>
        </div>
      </section>`;
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'activelift-test-' + today() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- events ----------

  function makeCode() {
    return 'AL-' + String(Math.floor(1000 + Math.random() * 9000));
  }

  const actions = {
    'ob-next'() {
      readOnboardInputs();
      const err = validateStep();
      if (err) return toast(err);
      state.onboardStep = Math.min(ONBOARD_STEPS - 1, state.onboardStep + 1);
    },
    'ob-back'() {
      readOnboardInputs();
      state.onboardStep = Math.max(0, state.onboardStep - 1);
    },
    'ob-avatar'(v) {
      readOnboardInputs();
      state.profile.avatar = v;
    },
    'ob-interest'(v) {
      const list = state.profile.interests;
      state.profile.interests = list.includes(v) ? list.filter((x) => x !== v) : list.concat(v);
    },
    'ob-level'(v) {
      state.profile.level = v;
    },
    'ob-time'(v) {
      state.profile.freeTime = v;
    },
    'ob-minutes'(v) {
      state.profile.minutes = Number(v);
    },
    'ob-days'(v) {
      state.profile.daysPerWeek = Number(v);
    },
    'ob-finish'() {
      const t = today();
      state.onboarded = true;
      state.startKey = t;
      state.invisibleUntil = L.addDays(t, L.INVISIBLE_DAYS);
      toast('ยินดีต้อนรับ ' + state.profile.nickname + '! 🎉');
    },
    tab(v) {
      if (v === 'season' && state.tab !== 'season') state.fakeDoor.views++;
      closeModal();
      state.tab = v;
      window.scrollTo(0, 0);
    },
    'open-checkin'() {
      openCheckin();
      return 'keep';
    },
    'ci-act'(v, el) {
      pickChip(el);
      return 'keep';
    },
    'ci-kind'(v, el) {
      pickChip(el);
      return 'keep';
    },
    'ci-mood'(v, el) {
      pickChip(el, true);
      return 'keep';
    },
    'ci-submit'() {
      submitCheckin();
      return 'keep';
    },
    'close-modal'() {
      closeModal();
      return 'keep';
    },
    survey(v) {
      const last = state.surveys[state.surveys.length - 1];
      if (last) last.reason = v || null;
      closeModal();
      if (v) toast('ขอบคุณที่บอกเรานะ เริ่มใหม่วันไหนก็ได้ 💛');
    },
    'reveal-friends'() {
      state.visibility = 'friends';
      toast('ตอนนี้กลุ่มเพื่อนสนิทเห็นคุณแล้ว 🌷');
    },
    'reveal-later'() {
      state.revealPromptDismissed = true;
    },
    buy(v) {
      buy(v);
      return 'keep';
    },
    'toggle-item'(v) {
      toggleItem(v);
      return 'keep';
    },
    'create-group'() {
      const name = document.getElementById('group-name').value.trim() || 'แก๊งขยับของ' + state.profile.nickname;
      const members = D.PEOPLE.filter((p) => !state.blocked.includes(p.name) && (!state.buddy || state.buddy.name !== p.name)).slice(0, 3).map((p) => p.name);
      state.group = { name, code: makeCode(), createdKey: today(), members };
      toast('สร้างกลุ่มแล้ว! เพื่อน ' + members.length + ' คนเข้าร่วมจากรหัสชวน');
    },
    'join-group'() {
      const code = document.getElementById('group-code').value.trim().toUpperCase();
      if (!code) return toast('ใส่รหัสกลุ่มก่อนนะ');
      const members = D.PEOPLE.filter((p) => !state.blocked.includes(p.name) && (!state.buddy || state.buddy.name !== p.name)).slice(3, 7).map((p) => p.name);
      state.group = { name: 'ก๊วนแบดหลังเลิกเรียน', code, createdKey: today(), members };
      toast('เข้าร่วมกลุ่มแล้ว 🏸');
    },
    'leave-group'() {
      if (!confirm('ออกจากกลุ่มนี้ใช่ไหม? streak ส่วนตัวของคุณจะยังอยู่ครบ')) return 'keep';
      state.group = null;
    },
    cheer(v) {
      openCheer(v);
      return 'keep';
    },
    'cheer-msg'(v, el) {
      state.cheersSent++;
      closeModal();
      toast('ส่ง “' + v + '” ให้' + el.dataset.to + 'แล้ว');
    },
    visit(v) {
      visitRoom(v);
      return 'keep';
    },
    'find-buddy'() {
      findBuddy();
      return 'keep';
    },
    'pick-buddy'(v) {
      state.buddy = { name: v, status: 'trial', startKey: today() };
      closeModal();
      toast('เริ่มช่วงลองคุยกับ' + v + 'แล้ว 🫶');
    },
    'buddy-link'() {
      state.buddy.status = 'linked';
      toast('เป็นบัดดี้กันแล้ว 💞');
    },
    'buddy-end'() {
      state.buddy = null;
      toast('ไม่เป็นไรเลย หาบัดดี้ใหม่ได้ตลอดนะ');
    },
    'buddy-report'() {
      if (!confirm('รายงานและบล็อก ' + state.buddy.name + '? อีกฝ่ายจะไม่เห็นคุณอีก')) return 'keep';
      state.blocked.push(state.buddy.name);
      if (state.group) state.group.members = state.group.members.filter((n) => n !== state.buddy.name);
      state.buddy = null;
      toast('เราได้รับรายงานแล้ว ขอบคุณที่บอกเรา 🙏');
    },
    'season-view'(v) {
      state.seasonView = v;
    },
    claim(v) {
      const [track, i] = v.split(':');
      claim([[track, Number(i)]]);
      return 'keep';
    },
    'claim-all'() {
      claimAll();
      return 'keep';
    },
    'buy-pass'() {
      openBuyPass();
      return 'keep';
    },
    'pass-self'() {
      unlockPremiumTrial();
      return 'keep';
    },
    'pass-parent'() {
      state.fakeDoor.parentClicks++;
      const msg = parentMessage();
      // The message is also shown in the modal in case the clipboard is unavailable.
      if (navigator.clipboard) navigator.clipboard.writeText(msg).catch(() => {});
      unlockPremiumTrial(`<p class="label">ข้อความส่งให้ผู้ปกครอง</p><div class="note">${esc(msg)}</div>`);
      return 'keep';
    },
    'join-league'() {
      if (!confirmSchoolVisibility()) return 'keep';
      state.visibility = 'school';
      toast('XP ของคุณช่วยโรงเรียนแล้ว 🏫');
    },
    trade(v) {
      openTrade(v);
      return 'keep';
    },
    'do-trade'(v, el) {
      doTrade(v, el.dataset.to);
      return 'keep';
    },
    'room-view'(v) {
      state.roomView = v;
    },
    'invite-teacher'() {
      openTeacherInvite();
      return 'keep';
    },
    redeem(v) {
      redeem(v);
      return 'keep';
    },
    'show-coupon'(v) {
      showCoupon(v);
      return 'keep';
    },
    'use-coupon'(v) {
      if (!confirm('ยืนยันว่าพนักงานรับคูปองนี้แล้ว? ใช้ซ้ำไม่ได้')) return 'keep';
      state.coupons.find((c) => c.code === v).usedKey = today();
      closeModal();
      toast('ใช้คูปองแล้ว ขอให้อร่อย/สนุกนะ 💛');
    },
    'next-day'() {
      state.dayOffset++;
      toast('ข้ามไป ' + today());
    },
    export() {
      exportData();
      return 'keep';
    },
    reset() {
      if (!confirm('ลบข้อมูลทั้งหมดและเริ่มใหม่?')) return 'keep';
      state = freshState();
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || el.type === 'radio') return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    if (fn(el.dataset.v, el) !== 'keep') {
      save();
      render();
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'ob-school') {
      readOnboardInputs();
      render();
      return;
    }
    const a = el.dataset.action;
    if (a === 'visibility') {
      if (el.value === 'school' && state.visibility !== 'school' && !confirmSchoolVisibility()) return render();
      state.visibility = el.value;
    }
    else if (a === 'set-minutes') state.profile.minutes = Number(el.value);
    else if (a === 'set-days') state.profile.daysPerWeek = Number(el.value);
    else return;
    save();
    render();
    toast('บันทึกแล้ว');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalRoot.hidden) closeModal();
  });

  render();
})();
