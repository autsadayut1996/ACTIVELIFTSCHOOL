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
      tab: 'home',
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

  let toastTimer = null;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
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
    { id: 'friends', name: 'เพื่อน', icon: '🤝' },
    { id: 'me', name: 'ฉัน', icon: '🌱' },
  ];

  function renderMain() {
    const s = streak();
    maybeAskExitSurvey(s);
    state.lastSeenStreak = s.count;
    save();

    const views = { home: viewHome, room: viewRoom, friends: viewFriends, me: viewMe };
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
      <section class="card soon">
        <h3>🏫 School League <span class="pill">Phase 2</span></h3>
        <p class="muted small">อันดับคิดจาก XP รวมของทั้งโรงเรียน ไม่ใช่รายบุคคล — ${esc(schoolName())}</p>
        ${state.visibility === 'school' ? '<p class="small">XP ของคุณถูกนับรวมให้โรงเรียนแล้ว 💪</p>' : '<p class="small">XP ของคุณจะยังไม่ถูกนับจนกว่าคุณจะเปิดการมองเห็นระดับโรงเรียน</p>'}
      </section>`;
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

  function roomHtml(placed, theme, avatar, acc) {
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
        <span class="me" style="left:52%;top:40%">${accItem && accItem.emoji ? `<span class="acc">${accItem.emoji}</span>` : ''}${avatar}</span>
      </div>`;
  }

  function viewRoom() {
    const visibleTo = { self: 'เฉพาะคุณ 👻', friends: 'กลุ่มเพื่อนสนิท', class: unitLabel() + 'และเพื่อนสนิท', school: 'ทั้งโรงเรียน' }[state.visibility];
    const shopItems = D.ITEMS.concat(D.ACCESSORIES.filter((a) => a.id !== 'none'));
    return `
      <section class="card">
        <div class="row between"><h3>ห้องของ${esc(state.profile.nickname)}</h3><span class="pill">มองเห็นโดย: ${visibleTo}</span></div>
        ${roomHtml(state.placed, state.theme, state.profile.avatar, state.acc)}
        <p class="muted small">ขยับครบ = ได้เหรียญมาแต่งห้อง แต่งเสร็จแคปไปลงสตอรี่ได้เลย 📸</p>
      </section>
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
    if (a === 'visibility') state.visibility = el.value;
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
