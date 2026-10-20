// UI for ActiveLift School. Game rules live in engine.js; data comes from a backend:
// LocalBackend (offline, simulated friends) or RemoteBackend (the server, real users).
(function () {
  'use strict';

  const L = window.Logic;
  const D = window.Data;
  const E = window.Engine;
  const UI_KEY = 'activelift-ui';
  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal');

  let backend = null;
  let snap = null; // latest snapshot: { mode, today, player, social, league, tournament, events, devTools }
  let queue = Promise.resolve();
  let pending = 0;
  let busy = false; // auth form only
  let authMode = 'register';

  // ---------- UI-only state (never sent to the server) ----------

  function freshUi() {
    return { tab: 'home', seasonView: 'pass', roomView: 'decor', onboardStep: 0, draft: E.freshPlayer().profile };
  }

  const ui = (function () {
    try {
      return Object.assign(freshUi(), JSON.parse(localStorage.getItem(UI_KEY)));
    } catch (e) {
      return freshUi();
    }
  })();

  function saveUi() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(ui));
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- helpers ----------

  const P = () => snap.player;
  const today = () => snap.today;
  const isRemote = () => snap && snap.mode === 'remote';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  const byId = (list, id) => list.find((x) => x.id === id);

  function schoolName(profile) {
    const p = profile || P().profile;
    if (p.schoolId === 'other') return p.schoolOther || 'โรงเรียนของฉัน';
    const s = byId(D.SCHOOLS, p.schoolId);
    return s ? s.name : '';
  }

  function unitLabel(profile) {
    const s = byId(D.SCHOOLS, (profile || P().profile).schoolId);
    return s && s.type === 'uni' ? 'คณะ' : 'ห้อง';
  }

  function streak() {
    return E.streak(P(), today());
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
      el.setAttribute('role', 'status');
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

  // Sends an action to the backend, swaps in the new snapshot and re-renders.
  // Calls run one at a time in order. Resolves with the action result, or null if it
  // failed (the error is shown as a toast).
  function run(action, args) {
    const job = queue.then(() => send(action, args));
    queue = job.catch(() => {});
    return job;
  }

  async function send(action, args) {
    pending++;
    document.body.classList.add('busy');
    try {
      const res = await backend.call(action, args);
      setSnapshot(res.snapshot);
      return res.result || {};
    } catch (e) {
      toast(e.message || 'เกิดข้อผิดพลาด');
      if (e.status === 401) {
        snap = null;
        render();
      }
      return null;
    } finally {
      if (--pending === 0) document.body.classList.remove('busy');
    }
  }

  function setSnapshot(s) {
    snap = s;
    render();
    const ev = s && s.events;
    if (!ev) return;
    ev.newCards.forEach((id) => {
      const a = byId(D.ACHIEVEMENTS, id);
      setTimeout(() => toast('ได้การ์ดใหม่ ' + a.emoji + ' ' + a.name + '!'), 300);
    });
    if (ev.askSurvey) setTimeout(() => openSurvey(ev.askSurvey), 50);
  }

  // ---------- auth (online mode only) ----------

  function renderAuth() {
    const reg = authMode === 'register';
    app.innerHTML = `
      <main class="onboard">
        <div class="hero">🏸✨</div>
        <h1 class="center">ActiveLift School</h1>
        <p class="lead center">${reg ? 'สร้างบัญชีเพื่อขยับกับเพื่อนจริงในโรงเรียน' : 'ยินดีต้อนรับกลับมา 💛'}</p>
        <div class="seg two">
          <button class="${reg ? 'on' : ''}" data-action="auth-mode" data-v="register">สมัครใหม่</button>
          <button class="${reg ? '' : 'on'}" data-action="auth-mode" data-v="login">เข้าสู่ระบบ</button>
        </div>
        <form id="auth-form" novalidate>
          <label class="field">ชื่อผู้ใช้
            <input id="auth-user" autocomplete="username" autocapitalize="none" maxlength="20" placeholder="เช่น mind_m4" />
          </label>
          <label class="field">รหัสผ่าน
            <input id="auth-pass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" maxlength="128" placeholder="${reg ? 'อย่างน้อย 8 ตัว' : ''}" />
          </label>
          ${reg ? '<p class="muted small">ไม่ต้องใช้อีเมล เบอร์โทร หรือชื่อจริง ใช้ชื่อผู้ใช้ที่ไม่ได้บอกว่าเป็นใครก็ได้ · a-z, 0-9, _ หรือ . ยาว 3–20 ตัว</p>' : ''}
          <button class="btn primary big" type="submit">${reg ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'}</button>
        </form>
      </main>`;
  }

  async function submitAuth() {
    const u = document.getElementById('auth-user').value.trim();
    const pw = document.getElementById('auth-pass').value;
    if (busy) return;
    busy = true;
    try {
      const r = authMode === 'register' ? await backend.register(u, pw) : await backend.login(u, pw);
      ui.onboardStep = 0;
      saveUi();
      setSnapshot(r.snapshot);
    } catch (e) {
      toast(e.message);
    } finally {
      busy = false;
    }
  }

  // ---------- onboarding ----------

  const ONBOARD_STEPS = 5;

  function renderOnboarding() {
    const p = ui.draft;
    const step = ui.onboardStep;
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
        <label class="field">${unitLabel(p)} (ไม่บังคับ)
          <input id="ob-unit" maxlength="30" value="${esc(p.unit)}" placeholder="${unitLabel(p) === 'คณะ' ? 'เช่น วิศวะ, นิเทศ' : 'เช่น ม.4/2'}" />
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
    const p = ui.draft;
    const val = (id) => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : null;
    };
    if (val('ob-nick') !== null) p.nickname = val('ob-nick');
    if (val('ob-school') !== null) p.schoolId = val('ob-school');
    if (val('ob-other') !== null) p.schoolOther = val('ob-other');
    if (val('ob-unit') !== null) p.unit = val('ob-unit');
  }

  function validateStep() {
    const p = ui.draft;
    if (ui.onboardStep === 1 && !p.nickname) return 'ใส่ชื่อเล่นก่อนนะ';
    if (ui.onboardStep === 2 && !p.schoolId) return 'เลือกสถาบันก่อนนะ';
    if (ui.onboardStep === 2 && p.schoolId === 'other' && !p.schoolOther) return 'พิมพ์ชื่อสถาบันก่อนนะ';
    if (ui.onboardStep === 3 && p.interests.length === 0) return 'เลือกอย่างน้อย 1 กิจกรรม';
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
    const views = { home: viewHome, room: viewRoom, season: viewSeason, friends: viewFriends, me: viewMe };
    const badges = { friends: snap.social.cheers.length + snap.social.buddyRequests.length, season: snap.social.tradeOffers.length };
    app.innerHTML = `
      <header class="topbar">
        <div class="who"><span class="mini-avatar">${P().profile.avatar}</span>${esc(P().profile.nickname)}</div>
        <div class="stats">
          <span title="Streak">🔥 ${s.count}</span>
          <span title="เหรียญ">🪙 ${P().coins}</span>
        </div>
      </header>
      <main class="content">${views[ui.tab](s)}</main>
      <nav class="tabbar">
        ${TABS.map((t) => `<button class="tab${ui.tab === t.id ? ' on' : ''}" data-action="tab" data-v="${t.id}"><span>${t.icon}</span>${t.name}${badges[t.id] ? `<i class="dot-badge">${badges[t.id]}</i>` : ''}</button>`).join('')}
      </nav>`;
  }

  function render() {
    if (!snap) return renderAuth();
    if (!P().onboarded) return renderOnboarding();
    renderMain();
  }

  // ---------- home ----------

  function viewHome(s) {
    const p = P();
    const lv = L.levelFor(p.xp);
    const t = today();
    const checkin = p.checkins[t];
    const invisibleLeft = L.invisibleDaysLeft(p.invisibleUntil, t);
    const group = snap.social.group;
    const weekDays = Array.from({ length: 7 }, (_, i) => L.addDays(L.weekKey(t), i));
    const doneThisWeek = weekDays.filter((k) => p.checkins[k]).length;

    let banner = '';
    if (p.visibility === 'self' && invisibleLeft > 0) {
      banner = `<div class="banner ghost">👻 โหมดไม่มีใครเห็นเปิดอยู่ (อีก ${invisibleLeft} วัน)<br/><small>XP และ streak ยังสะสมตามปกติ แค่ยังไม่มีใครเห็นคุณ</small></div>`;
    } else if (p.visibility === 'self' && !p.revealPromptDismissed) {
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
          <p class="muted">เป้าวันนี้: ขยับ ${p.profile.minutes} นาที แบบไหนก็ได้</p>
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
            .map((k, i) => {
              const cls = p.checkins[k] ? 'on' : s.frozenDays.includes(k) ? 'frozen' : k === t ? 'today' : '';
              return `<div class="day ${cls}"><span>${p.checkins[k] ? '✓' : s.frozenDays.includes(k) ? '❄️' : ''}</span>${['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'][i]}</div>`;
            })
            .join('')}
        </div>
        <p class="muted small">สัปดาห์นี้ ${doneThisWeek}/${p.profile.daysPerWeek} วันตามที่ตั้งใจ ${doneThisWeek >= p.profile.daysPerWeek ? '🎉 ครบแล้ว!' : ''}</p>
      </section>
      <section class="card">
        <div class="row between"><h3>Lv.${lv.level} ${esc(lv.title)}</h3><span class="muted small">${lv.into}/${lv.need} XP</span></div>
        <div class="bar"><div style="width:${(lv.into / lv.need) * 100}%"></div></div>
      </section>
      ${
        group
          ? `<section class="card link" data-action="tab" data-v="friends">
              <h3>👯 ${esc(group.name)}</h3>
              <p>Group streak <b>${group.streak} วัน</b> · ${group.countsToday ? 'วันนี้ผ่านแล้ว 🎉' : `วันนี้ต้องเช็คอินอีก ${group.remaining} คน`}</p>
            </section>`
          : `<section class="card link" data-action="tab" data-v="friends">
              <h3>🤝 ยังไม่มีกลุ่มเพื่อนสนิท</h3>
              <p class="muted">สร้างกลุ่ม 5–10 คน หรือให้เราหาบัดดี้จากสถาบันเดียวกันให้</p>
            </section>`
      }
      ${homeSeasonCard(t)}`;
  }

  function openCheckin() {
    const p = P().profile;
    const acts = D.ACTIVITIES.filter((a) => p.interests.includes(a.id)).concat(D.ACTIVITIES.filter((a) => !p.interests.includes(a.id)));
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

  async function submitCheckin() {
    const sel = (id) => {
      const el = document.querySelector('#' + id + ' .chip.on');
      return el ? el.dataset.v : null;
    };
    const args = { activity: sel('ci-acts'), kind: sel('ci-kind') || 'full', mood: sel('ci-mood') };
    closeModal();
    const r = await run('checkin', args);
    if (!r) return;
    const unlocked = r.unlocked.map((id) => E.findItem(id));
    if (unlocked.length) toast('ปลดล็อก ' + unlocked.map((i) => i.emoji + ' ' + i.name).join(', ') + '!');
    else if (r.levelUp) toast('เลเวลอัป! Lv.' + r.levelUp + ' ' + L.levelFor(P().xp).title + ' 🎉');
    else toast(r.message);
  }

  // ---------- exit survey (listen to the people who stop) ----------

  function openSurvey(prev) {
    openModal(`
      <div class="hero">💛</div>
      <h2>ไม่เป็นไรเลยนะ พักได้</h2>
      <p class="muted">streak ${prev} วันที่ผ่านมาไม่ได้หายไปไหน มันคือสิ่งที่คุณทำได้จริง<br/>อยากบอกเราไหมว่าช่วงนี้เป็นยังไงบ้าง? (ไม่บังคับ)</p>
      <div class="chips">${D.EXIT_REASONS.map((r) => `<button class="chip" data-action="survey" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      <button class="btn" data-action="survey" data-v="">ข้ามไปก่อน</button>`);
  }

  // ---------- mini room ----------

  function roomHtml(placed, theme, avatar, acc, badge) {
    const th = theme && byId(D.ITEMS, theme) ? byId(D.ITEMS, theme).theme : { wall: '#fdf0f6', floor: '#f3d9e6' };
    const accItem = byId(D.ACCESSORIES, acc);
    return `
      <div class="room" style="--wall:${th.wall};--floor:${th.floor}">
        <div class="wall"></div><div class="floor"></div>
        ${(placed || [])
          .map((id) => byId(D.ITEMS, id))
          .filter((i) => i && !i.theme)
          .map((i) => `<span class="item" style="left:${i.x}%;top:${i.y}%;font-size:${i.size}rem" title="${esc(i.name)}">${i.emoji}</span>`)
          .join('')}
        ${badge ? `<span class="badge">${esc(badge)}</span>` : ''}
        <span class="me" style="left:52%;top:40%">${accItem && accItem.emoji ? `<span class="acc">${accItem.emoji}</span>` : ''}${avatar}</span>
      </div>`;
  }

  function viewRoom() {
    const p = P();
    const visibleTo = { self: 'เฉพาะคุณ 👻', friends: 'กลุ่มเพื่อนสนิท', class: unitLabel() + 'และเพื่อนสนิท', school: 'ทั้งโรงเรียน' }[p.visibility];
    return `
      <section class="card">
        <div class="row between"><h3>ห้องของ${esc(p.profile.nickname)}</h3><span class="pill">มองเห็นโดย: ${visibleTo}</span></div>
        ${roomHtml(p.placed, p.theme, p.profile.avatar, p.acc, schoolBadge())}
        <p class="muted small">ขยับครบ = ได้เหรียญมาแต่งห้อง แต่งเสร็จแคปไปลงสตอรี่ได้เลย 📸</p>
      </section>
      <div class="seg two">
        <button class="${ui.roomView === 'decor' ? 'on' : ''}" data-action="room-view" data-v="decor">🛋️ ของแต่ง</button>
        <button class="${ui.roomView === 'coupons' ? 'on' : ''}" data-action="room-view" data-v="coupons">🎁 คูปองร้านค้า</button>
      </div>
      ${ui.roomView === 'coupons' ? viewCoupons() : viewShop()}`;
  }

  function viewShop() {
    const p = P();
    // Season exclusives only appear once earned from the Battle Pass.
    const shopItems = D.ITEMS.concat(D.ACCESSORIES.filter((a) => a.id !== 'none')).filter((i) => !i.season || p.owned.includes(i.id));
    return `
      <section class="card">
        <h3>ของในห้อง & ร้านค้า</h3>
        <p class="muted small">ขายแค่ของแต่ง ไม่มีของที่ทำให้ได้ XP เร็วขึ้น — แฟร์กับทุกคน</p>
        <div class="shop">
          ${shopItems
            .map((i) => {
              const owned = p.owned.includes(i.id);
              const isAcc = Boolean(byId(D.ACCESSORIES, i.id));
              const active = isAcc ? p.acc === i.id : i.theme ? p.theme === i.id : p.placed.includes(i.id);
              let btn;
              if (owned) btn = `<button class="btn small${active ? ' primary' : ''}" data-action="toggle-item" data-v="${i.id}">${active ? 'ใช้อยู่' : 'ใช้'}</button>`;
              else if (i.unlock) btn = `<span class="pill">🔒 streak ${i.unlock.streak}</span>`;
              else btn = `<button class="btn small" data-action="buy" data-v="${i.id}"${p.coins < i.cost ? ' disabled' : ''}>🪙 ${i.cost}</button>`;
              return `<div class="shop-item"><span class="shop-emoji">${i.emoji}</span><span class="shop-name">${esc(i.name)}</span>${btn}</div>`;
            })
            .join('')}
        </div>
      </section>`;
  }

  // ---------- friends: close-friends group, buddy, cheers ----------

  function progressText(m) {
    if (m.streak === null) return '👻 ยังไม่เปิดให้เห็น';
    return `🔥 ${m.streak} วัน · ${m.checkedToday ? 'ขยับแล้ว ✓' : 'ยังไม่ขยับ'}`;
  }

  function memberRow(m) {
    return `
      <div class="member">
        <span class="mini-avatar">${m.avatar}</span>
        <div class="grow"><b>${esc(m.name)}</b><br/><small class="muted">${progressText(m)}</small></div>
        <button class="btn small" data-action="cheer" data-v="${esc(m.id)}">💌 เชียร์</button>
        ${m.room ? `<button class="btn small ghost-btn" data-action="visit" data-v="${esc(m.id)}" aria-label="เยี่ยมห้อง">🏠</button>` : ''}
      </div>`;
  }

  function friends() {
    const s = snap.social;
    const list = s.group ? s.group.members.slice() : [];
    if (s.buddy && (s.buddy.status === 'trial' || s.buddy.status === 'linked') && !list.some((m) => m.id === s.buddy.id)) list.push(s.buddy);
    return list;
  }

  const findFriend = (id) => friends().find((m) => String(m.id) === String(id));

  function viewFriends() {
    const p = P();
    const s = snap.social;
    const t = today();
    const parts = [];

    if (s.cheers.length) {
      parts.push(`
        <section class="card inbox">
          <h3>💌 กำลังใจจากเพื่อน</h3>
          ${s.cheers.map((c) => `<div class="member"><span class="mini-avatar">${c.avatar}</span><div class="grow"><b>${esc(c.name)}</b><br/><small>${esc(c.message)}</small></div></div>`).join('')}
          <button class="btn small" data-action="cheers-read">อ่านแล้ว</button>
        </section>`);
    }

    if (s.buddy && s.buddy.status === 'pending_in') {
      parts.push(`
        <section class="card inbox">
          <h3>🫶 ${esc(s.buddy.name)} อยากเป็นบัดดี้ขยับด้วยกัน</h3>
          <p class="muted small">อยู่สถาบันเดียวกับคุณ · ลองคุยกัน ${L.BUDDY_TRIAL_DAYS} วันก่อน ไม่ถูกคอก็แยกกันได้ · ไม่แชร์ข้อมูลติดต่อ</p>
          <div class="row"><button class="btn small primary" data-action="buddy-respond" data-v="yes">ลองดู</button>
          <button class="btn small" data-action="buddy-respond" data-v="no">ไม่เป็นไร ขอบคุณ</button></div>
        </section>`);
    }

    if (p.visibility === 'self') {
      parts.push(`<div class="banner ghost">👻 ตอนนี้เพื่อนยังไม่เห็น streak และมินิรูมของคุณ แต่คุณส่งกำลังใจให้เพื่อนได้ตามปกติ
        <div class="row"><button class="btn small" data-action="tab" data-v="me">ตั้งค่าการมองเห็น</button></div></div>`);
    }

    if (s.group) {
      const g = s.group;
      parts.push(`
        <section class="card">
          <div class="row between"><h3>👯 ${esc(g.name)}</h3><span class="pill">${g.total}/10 คน</span></div>
          <p>Group streak <b>${g.streak} วัน</b> ${g.countsToday ? '— วันนี้ผ่านแล้ว 🎉' : `— วันนี้ต้องเช็คอินอีก ${g.remaining} คน`}</p>
          <p class="muted small">streak รวมจะไปต่อเมื่อเพื่อนครึ่งหนึ่งขยับในวันนั้น ช่วยกันรักษานะ</p>
          <div class="members">
            <div class="member"><span class="mini-avatar">${p.profile.avatar}</span><div class="grow"><b>${esc(p.profile.nickname)} (คุณ)</b><br/><small class="muted">🔥 ${streak().count} วัน · ${p.checkins[t] ? 'ขยับแล้ว ✓' : 'ยังไม่ขยับ'}</small></div></div>
            ${g.members.map(memberRow).join('')}
          </div>
          ${!g.members.length && isRemote() ? '<p class="muted small">ยังไม่มีเพื่อนในกลุ่ม ส่งรหัสด้านล่างให้เพื่อนสนิทเลย</p>' : ''}
          <p class="muted small">รหัสชวนเพื่อน: <b class="code">${esc(g.code)}</b></p>
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
          <label class="field">มีรหัสจากเพื่อนแล้ว?<input id="group-code" maxlength="10" placeholder="เช่น AL-K7Q2MX" autocapitalize="characters" /></label>
          <button class="btn" data-action="join-group">เข้าร่วมกลุ่ม</button>
        </section>`);
    }

    parts.push(viewBuddy());
    return parts.join('');
  }

  function viewBuddy() {
    const b = snap.social.buddy;
    if (b && b.status !== 'pending_in') {
      let body;
      if (b.status === 'pending_out') {
        body = `<p class="muted small">ส่งคำขอแล้ว รอ${esc(b.name)}ตอบรับ</p><button class="btn small" data-action="buddy-end">ยกเลิกคำขอ</button>`;
      } else if (b.status === 'trial' && b.trialLeft > 0) {
        body = `<p class="muted small">ช่วงลองคุยกัน: เหลืออีก ${b.trialLeft} วัน ก่อนตัดสินใจผูก streak ร่วมกัน</p>`;
      } else if (b.status === 'trial' && b.iConfirmed) {
        body = `<p class="muted small">คุณยืนยันแล้ว รอ${esc(b.name)}ยืนยันอยู่ 💞</p>`;
      } else if (b.status === 'trial') {
        body = `<p>ครบ ${L.BUDDY_TRIAL_DAYS} วันแล้ว อยากเป็นบัดดี้กันต่อไหม?</p>
          <div class="row"><button class="btn small primary" data-action="buddy-link">ผูก streak ร่วมกัน</button>
          <button class="btn small" data-action="buddy-end">ไม่เป็นไร ขอบคุณนะ</button></div>`;
      } else {
        body = '<p class="muted small">เป็นบัดดี้กันแล้ว 💞 เห็น streak ของกันและกันได้ตลอด</p>';
      }
      return `
        <section class="card">
          <h3>🫶 บัดดี้ของคุณ</h3>
          ${b.status === 'pending_out' ? `<div class="member"><span class="mini-avatar">${b.avatar}</span><div class="grow"><b>${esc(b.name)}</b></div></div>` : memberRow(b)}
          ${body}
          <p class="muted small">🔒 ไม่มีแชทอิสระและไม่แชร์ข้อมูลติดต่อส่วนตัว ส่งได้แค่ข้อความให้กำลังใจ</p>
          ${b.status === 'pending_out' ? '' : '<button class="btn small danger" data-action="buddy-report">รายงาน / บล็อก</button>'}
        </section>`;
    }
    if (b) return '';
    const looking = P().lookingForBuddy;
    return `
      <section class="card">
        <h3>🫶 หาบัดดี้ขยับด้วยกัน</h3>
        <p class="muted">ยังไม่มีเพื่อนมาด้วย? เราจับคู่ให้จากสถาบันเดียวกัน ดูจากระดับการขยับ เวลาว่าง และกิจกรรมที่ชอบ — ไม่ดูรูปร่างหน้าตา</p>
        <button class="btn primary" data-action="find-buddy">หาบัดดี้ให้หน่อย</button>
        ${
          looking
            ? `<p class="muted small">คุณเปิดรับบัดดี้อยู่: คนในสถาบันเดียวกันที่กำลังหาบัดดี้จะเห็นชื่อเล่นและตัวละครของคุณ (ไม่เห็นข้อมูลอื่น)</p>
               <button class="btn small" data-action="buddy-stop-looking">ปิดการรับบัดดี้</button>`
            : ''
        }
      </section>`;
  }

  async function findBuddy() {
    const r = await run('buddy-find');
    if (!r) return;
    if (!r.candidates.length) {
      openModal(`
        <h2>ยังไม่มีคนที่กำลังหาบัดดี้</h2>
        <p class="muted">ตอนนี้คุณเปิดรับบัดดี้แล้ว เมื่อมีคนใน${esc(schoolName())}ที่กำลังหาบัดดี้ เขาจะส่งคำขอมาที่หน้านี้ หรือลองกดหาใหม่ภายหลังนะ</p>
        <button class="btn primary big" data-action="close-modal">โอเค</button>`);
      return;
    }
    openModal(`
      <h2>บัดดี้ที่น่าจะเข้ากัน</h2>
      <p class="muted small">ทุกคนอยู่ ${esc(schoolName())} · ลองคุยกัน ${L.BUDDY_TRIAL_DAYS} วันก่อน ไม่ถูกคอก็แยกกันได้ไม่ต้องเกรงใจ</p>
      ${r.candidates
        .map(
          (c) => `
        <div class="member">
          <span class="mini-avatar">${c.avatar}</span>
          <div class="grow"><b>${esc(c.name)}</b><br/><small class="muted">${c.shared.map((id) => byId(D.ACTIVITIES, id).emoji + ' ' + byId(D.ACTIVITIES, id).name).concat(c.reasons).join(' · ') || 'อยากลองขยับเหมือนกัน'}</small></div>
          <button class="btn small primary" data-action="pick-buddy" data-v="${esc(c.id)}">ลองคุย</button>
        </div>`
        )
        .join('')}`);
  }

  function visitRoom(id) {
    const m = findFriend(id);
    if (!m || !m.room) return toast('เพื่อนยังไม่เปิดให้เห็นห้อง');
    openModal(`
      <h2>ห้องของ${esc(m.name)}</h2>
      ${roomHtml(m.room.placed, m.room.theme, m.avatar, m.room.acc)}
      ${cheerChips(m)}`);
  }

  function cheerChips(m) {
    return `<div class="chips">${D.CHEERS.map((c) => `<button class="chip" data-action="cheer-msg" data-to="${esc(m.id)}" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
  }

  function openCheer(id) {
    const m = findFriend(id);
    if (!m) return;
    openModal(`
      <h2>ส่งกำลังใจให้${esc(m.name)}</h2>
      <p class="muted small">ข้อความสำเร็จรูปเท่านั้น เพื่อให้ทุกคนปลอดภัย</p>
      ${cheerChips(m)}`);
  }

  // Local ids are names; server ids are numbers.
  const friendId = (v) => (isRemote() ? Number(v) : v);

  // ---------- season: Battle Pass, School League, collectible cards ----------

  function myLeagueRow() {
    return snap.league.find((r) => r.mine);
  }

  function schoolBadge() {
    if (P().visibility !== 'school') return '';
    const mine = myLeagueRow();
    return mine ? '🏫 #' + mine.rank : '';
  }

  function confirmSchoolVisibility() {
    return confirm('เปิดให้ทั้งโรงเรียนเห็น?\n\nคนในโรงเรียนจะเห็นชื่อเล่นและมินิรูมของคุณ และ XP ของคุณจะถูกนับเข้า School League (อันดับเป็นของโรงเรียน ไม่มีอันดับรายบุคคล)\nเปลี่ยนกลับได้ตลอด');
  }

  function homeSeasonCard(t) {
    const season = L.seasonFor(t);
    const tier = E.seasonTier(P(), t);
    const mine = myLeagueRow();
    return `
      <section class="card soon link" data-action="tab" data-v="season">
        <div class="row between"><h3>🏆 ซีซั่น ${season.number}</h3><span class="pill">เหลือ ${season.daysLeft} วัน</span></div>
        <p class="small">Battle Pass tier <b>${tier}/${L.MAX_TIER}</b> · ${esc(schoolName())} ${mine ? `อันดับ <b>#${mine.rank}</b> สัปดาห์นี้` : ''}</p>
        <p class="muted small">${P().visibility === 'school' ? 'XP ของคุณช่วยโรงเรียนอยู่ 💪' : 'XP ของคุณยังไม่ถูกนับเข้า League (ตั้งค่าได้ในแท็บ ฉัน)'}</p>
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
      <div class="seg four">${seg.map(([v, n]) => `<button class="${ui.seasonView === v ? 'on' : ''}" data-action="season-view" data-v="${v}">${n}${v === 'cards' && snap.social.tradeOffers.length ? ' •' : ''}</button>`).join('')}</div>
      ${views[ui.seasonView]()}`;
  }

  function viewPass() {
    const p = P();
    const t = today();
    const pass = p.pass;
    const season = L.seasonFor(t);
    const sxp = L.xpBetween(p.checkins, season.startKey, t);
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
      return `<div class="tier-cell${reached ? ' reached' : ''}${claimed ? ' claimed' : ''}"><span>${E.rewardLabel(r)}</span>${action}</div>`;
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
              <h3>✨ Premium Pass ${p.priceVariant} บาท</h3>
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

  async function claimRewards(action, args) {
    const r = await run(action, args);
    if (!r) return;
    if (r.pulled.length) showPack(r.pulled);
    else if (r.labels.length) toast('ได้ ' + r.labels.join(', '));
  }

  function showPack(pulled) {
    openModal(`
      <h2>เปิดแพ็กการ์ด! 🃏</h2>
      <div class="cards pack">
        ${pulled
          .map((x, i) => {
            const c = byId(D.PHOTOCARDS, x.id);
            return `<div class="pcard ${c.rarity}" style="animation-delay:${i * 0.12}s"><span class="pcard-emoji">${c.emoji}</span><b>${esc(c.name)}</b><small>${D.RARITY[c.rarity]} · ${x.isNew ? 'ใหม่!' : 'ซ้ำ'}</small></div>`;
          })
          .join('')}
      </div>
      <p class="muted small">การ์ดซ้ำเอาไปแลกกับเพื่อนในแก๊งได้ที่แท็บการ์ด</p>
      <button class="btn primary big" data-action="close-modal">เก็บเข้าอัลบั้ม</button>`);
  }

  function openBuyPass() {
    const p = P();
    run('fake-door', { key: 'buyClicks' });
    openModal(`
      <h2>✨ Premium Pass ซีซั่น ${p.pass.season}</h2>
      <p>${p.priceVariant} บาท จ่ายครั้งเดียวทั้งซีซั่น ไม่ใช่รายเดือน</p>
      <ul class="promise">
        ${D.PASS_PREMIUM.filter((r) => r.item).map((r) => `<li>${E.rewardLabel(r)}</li>`).join('')}
        <li>🃏 การ์ดเพิ่ม ${D.PASS_PREMIUM.reduce((n, r) => n + (r.pack || 0), 0)} แพ็ก</li>
      </ul>
      <p class="muted small">ไม่มี XP boost ไม่มีทางลัด — ทุกคนไต่ tier ด้วยความสม่ำเสมอเท่ากัน</p>
      <button class="btn primary big" data-action="pass-self">ซื้อเอง ${p.priceVariant} บาท</button>
      <button class="btn big" data-action="pass-parent">👨‍👩‍👧 ขอให้ผู้ปกครองซื้อให้</button>
      <button class="btn big ghost-btn" data-action="close-modal">ไว้ก่อน</button>`);
  }

  async function unlockPremiumTrial(extra) {
    if (!(await run('unlock-premium'))) return;
    openModal(`
      <div class="hero">💛</div>
      <h2>ขอบคุณที่สนใจ!</h2>
      <p>ตอนนี้ยังไม่มีการเก็บเงินจริง เราปลดล็อก Premium ให้ทดลองฟรีตลอดซีซั่นนี้</p>
      ${extra || ''}
      <button class="btn primary big" data-action="close-modal">ไปรับรางวัล</button>`);
  }

  function parentMessage() {
    const total = Object.keys(P().checkins).length;
    return `ช่วยซื้อ Premium Pass ของแอป ActiveLift School ให้หน่อยได้ไหม (${P().priceVariant} บาท ครั้งเดียวทั้งซีซั่น) เป็นของแต่งห้องล้วนๆ ไม่มีทางลัด ตอนนี้ออกกำลังกายมาแล้ว ${total} วัน 💪`;
  }

  function viewLeague() {
    const p = P();
    const rows = snap.league;
    const mine = myLeagueRow();
    const top = rows.slice(0, 8);
    if (mine && mine.rank > 8) top.push(mine);
    const max = Math.max(1, rows[0] ? rows[0].avg : 1);
    const resetIn = 7 - L.diffDays(L.weekKey(today()), today());
    const weekXp = L.xpBetween(p.checkins, L.weekKey(today()), today());
    return `
      <section class="card">
        <div class="row between"><h3>🏫 School League</h3><span class="pill">รีเซ็ตใน ${resetIn} วัน</span></div>
        <p class="muted small">วัดจาก XP เฉลี่ยต่อสมาชิกในสัปดาห์นี้ โรงเรียนเล็กก็ชนะได้ ไม่มีอันดับรายบุคคล</p>
        <div class="league">
          ${top
            .map(
              (r) => `
            <div class="league-row${r.mine ? ' mine' : ''}">
              <span class="rank">${r.rank <= 3 && r.avg > 0 ? ['🥇', '🥈', '🥉'][r.rank - 1] : '#' + r.rank}</span>
              <div class="grow"><b>${esc(r.name)}</b>${isRemote() ? `<small class="muted"> · ${r.members} คน</small>` : ''}<div class="bar thin"><div style="width:${(r.avg / max) * 100}%"></div></div></div>
              <span class="small">${r.avg}</span>
            </div>`
            )
            .join('')}
        </div>
        ${!mine ? '<p class="muted small">สถาบันของคุณยังไม่อยู่ในลีก ชวนเพื่อนมาสมัครเยอะๆ แล้วเราจะเพิ่มให้</p>' : ''}
      </section>
      <section class="card">
        ${
          p.visibility === 'school'
            ? `<p>คุณช่วย ${esc(schoolName())} ไป <b>+${weekXp} XP</b> สัปดาห์นี้ 💪</p>${schoolBadge() ? `<p class="muted small">ป้าย ${esc(schoolBadge())} แสดงอยู่ในมินิรูมของคุณ</p>` : ''}`
            : `<p>XP ของคุณยังไม่ถูกนับเข้า League</p>
               <p class="muted small">ไม่เป็นไรเลย ค่อยเปิดตอนพร้อม XP และ streak ส่วนตัวยังสะสมตามปกติ</p>
               <button class="btn" data-action="join-league">นับ XP ของฉันให้โรงเรียน</button>`
        }
      </section>`;
  }

  function viewCards() {
    const p = P();
    const ach = D.ACHIEVEMENTS;
    const pcs = D.PHOTOCARDS;
    const ownedPc = pcs.filter((c) => p.cards[c.id]).length;
    const dups = pcs.filter((c) => (p.cards[c.id] || 0) >= 2);
    const offers = snap.social.tradeOffers;
    return `
      ${
        offers.length
          ? `<section class="card inbox">
              <h3>🔄 ข้อเสนอแลกการ์ด</h3>
              ${offers
                .map((o) => {
                  const c = byId(D.PHOTOCARDS, o.card);
                  return `<div class="offer">
                    <p><b>${esc(o.name)}</b> อยากให้ ${c.emoji} ${esc(c.name)} แลกกับการ์ดซ้ำของคุณ 1 ใบ</p>
                    <div class="chips">${dups.map((d) => `<button class="chip" data-action="trade-accept" data-offer="${o.id}" data-v="${d.id}">ให้ ${d.emoji} ${esc(d.name)}</button>`).join('') || '<span class="muted small">คุณยังไม่มีการ์ดซ้ำให้แลก</span>'}</div>
                    <button class="btn small" data-action="trade-decline" data-offer="${o.id}">ไม่แลก</button>
                  </div>`;
                })
                .join('')}
            </section>`
          : ''
      }
      <section class="card">
        <div class="row between"><h3>การ์ดความสำเร็จ</h3><span class="pill">${ach.filter((a) => p.cards[a.id]).length}/${ach.length}</span></div>
        <p class="muted small">ได้จาก milestone ความสม่ำเสมอ ไม่ใช่จากรูปร่างหรือตัวเลขบนตาชั่ง</p>
        <div class="cards">
          ${ach
            .map((a) =>
              p.cards[a.id]
                ? `<div class="pcard ${a.rarity}"><span class="pcard-emoji">${a.emoji}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`
                : `<div class="pcard locked"><span class="pcard-emoji">🔒</span><b>???</b><small>${esc(a.desc)}</small></div>`
            )
            .join('')}
        </div>
      </section>
      <section class="card">
        <div class="row between"><h3>โฟโต้การ์ด</h3><span class="pill">${ownedPc}/${pcs.length}</span></div>
        <p class="muted small">ได้จากแพ็กใน Battle Pass · ใบซ้ำแลกกับเพื่อนในแก๊งได้${snap.social.outgoingTrades ? ` · รอเพื่อนตอบ ${snap.social.outgoingTrades} ข้อเสนอ` : ''}</p>
        <div class="cards">
          ${pcs
            .map((c) => {
              const n = p.cards[c.id] || 0;
              if (!n) return `<div class="pcard locked"><span class="pcard-emoji">❔</span><b>???</b><small>${D.RARITY[c.rarity]}</small></div>`;
              return `<div class="pcard ${c.rarity}"><span class="pcard-emoji">${c.emoji}</span><b>${esc(c.name)}</b><small>${D.RARITY[c.rarity]}${n > 1 ? ' · x' + n : ''}</small>${n > 1 ? `<button class="btn small" data-action="trade" data-v="${c.id}">แลก</button>` : ''}</div>`;
            })
            .join('')}
        </div>
      </section>`;
  }

  function openTrade(cardId) {
    const give = byId(D.PHOTOCARDS, cardId);
    const partners = friends();
    const body = partners.length
      ? partners
          .map(
            (m) => `<div class="member"><span class="mini-avatar">${m.avatar}</span>
            <div class="grow"><b>${esc(m.name)}</b><br/><small class="muted">${isRemote() ? 'เพื่อนเลือกการ์ดซ้ำของเขามาแลกกลับ' : 'แลกกับใบที่คุณยังขาด'}</small></div>
            <button class="btn small primary" data-action="do-trade" data-v="${cardId}" data-to="${esc(m.id)}">เสนอแลก</button></div>`
          )
          .join('')
      : `<p class="muted">แลกได้เฉพาะกับเพื่อนในแก๊งหรือบัดดี้ ยังไม่มีเลย ลองสร้างกลุ่มก่อนนะ</p>
         <button class="btn primary" data-action="tab" data-v="friends">ไปหน้าเพื่อน</button>`;
    openModal(`<h2>แลก ${give.emoji} ${esc(give.name)}</h2><p class="muted small">แลกเฉพาะใบซ้ำ ใบสุดท้ายของคุณจะอยู่กับคุณเสมอ</p>${body}`);
  }

  // ---------- inter-school tournament ----------

  function shortSchool(id) {
    return byId(D.SCHOOLS, id).name.replace(/^โรงเรียน|^มหาวิทยาลัย/, '').replace(/ \(.*\)$/, '');
  }

  function viewTournament() {
    const p = P();
    const t = today();
    const { tour, rounds } = snap.tournament;
    const partner = D.TOURNAMENT_SCHOOLS.includes(p.profile.schoolId);
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
    } else if (tour.phase === 'live' && rounds.length) {
      const live = rounds[rounds.length - 1];
      const round = tour.rounds[live.round];
      const days = Object.keys(p.checkins).filter((k) => k >= round.startKey && k <= round.endKey).length;
      const stillIn = live.matches.some((m) => m.a === p.profile.schoolId || m.b === p.profile.schoolId);
      const shown = Math.min(days, L.TOURNAMENT_MIN_DAYS);
      parts.push(`
        <section class="card">
          <h3>สัปดาห์นี้: ${D.ROUND_NAMES[live.round]}</h3>
          ${
            !stillIn
              ? '<p>โรงเรียนของคุณตกรอบแล้ว ซีซั่นหน้าเอาใหม่! 💪 ยังเชียร์โรงเรียนอื่นได้นะ</p>'
              : p.visibility !== 'school'
                ? `<p class="small">การขยับของคุณจะนับให้โรงเรียนเมื่อเปิดการมองเห็นระดับโรงเรียน</p><button class="btn" data-action="join-league">นับให้โรงเรียนด้วย</button>`
                : `<p>คุณขยับไปแล้ว <b>${shown}/${L.TOURNAMENT_MIN_DAYS}</b> วัน ${days >= L.TOURNAMENT_MIN_DAYS ? '— นับเป็น 1 คนให้โรงเรียนแล้ว ✓' : ''}</p>
                   <div class="bar"><div style="width:${(shown / L.TOURNAMENT_MIN_DAYS) * 100}%"></div></div>`
          }
        </section>`);
    }

    rounds.forEach((r) => {
      parts.push(`
        <section class="card">
          <div class="row between"><h3>${D.ROUND_NAMES[r.round]}</h3><span class="pill">${r.finished ? 'จบแล้ว' : 'กำลังแข่ง'}</span></div>
          ${r.matches
            .map((m) => {
              const side = (id, sc) => `<div class="side${m.winner === id ? ' win' : ''}${id === p.profile.schoolId ? ' mine' : ''}"><span>${esc(shortSchool(id))}</span><b>${sc}%</b></div>`;
              return `<div class="match">${side(m.a, m.sa)}${side(m.b, m.sb)}</div>`;
            })
            .join('')}
        </section>`);
    });

    if (tour.phase === 'done' && rounds[2]) {
      const final = rounds[2].matches[0];
      const mine = final.winner === p.profile.schoolId;
      parts.push(`
        <section class="card center ${mine ? 'done' : ''}">
          <div class="hero">🏆</div>
          <h2>แชมป์ซีซั่น ${tour.season}: ${esc(shortSchool(final.winner))}</h2>
          <p class="muted">${mine ? 'โรงเรียนของคุณคือแชมป์! ทุกคนที่ขยับคือส่วนหนึ่งของชัยชนะนี้ 🎉' : 'ทัวร์นาเมนต์ใหม่เริ่มสัปดาห์ที่ 2 ของซีซั่นหน้า'}</p>
        </section>`);
    }
    return parts.join('');
  }

  function openTeacherInvite() {
    run('fake-door', { key: 'teacherInvites' });
    const msg = `เรียนคุณครู นักเรียนอยากชวน ${schoolName()} เข้าร่วม “ศึกขยับข้ามโรงเรียน” ของแอป ActiveLift School ค่ะ/ครับ เป็นแอปออกกำลังกายที่ไม่วัดรูปร่างหรือน้ำหนัก วัดแค่ความสม่ำเสมอ ใช้ประกอบวิชาพลศึกษาได้ และโรงเรียนดูภาพรวมการขยับของนักเรียนได้`;
    if (navigator.clipboard) navigator.clipboard.writeText(msg).catch(() => {});
    openModal(`
      <h2>ชวนครูพละ 🧑‍🏫</h2>
      <p class="muted small">ส่งข้อความนี้ให้ครูหรือสโมสรนักเรียน ทีมงานจะติดต่อกลับเพื่อจัดแข่งให้</p>
      <div class="note">${esc(msg)}</div>
      <p class="muted small">ขอบคุณที่ช่วยชวน! (เรานับไว้เป็นความสนใจของโรงเรียน)</p>
      <button class="btn primary big" data-action="close-modal">เรียบร้อย</button>`);
  }

  // ---------- local brand redemption ----------

  function viewCoupons() {
    const p = P();
    const t = today();
    const coupons = p.coupons.slice().reverse();
    const can = L.canRedeem(p.coupons, t);
    const statusText = { active: 'ใช้ได้', used: 'ใช้แล้ว', expired: 'หมดอายุ' };
    return `
      <section class="card">
        <div class="row between"><h3>🎁 คูปองร้านใกล้โรงเรียน</h3><span class="pill">🪙 ${p.coins}</span></div>
        <p class="muted small">แลกเหรียญจากการขยับเป็นส่วนลดจริง สัปดาห์ละ 1 ใบ ใช้ได้ ${L.COUPON_DAYS} วัน · ร้านค้าพาร์ทเนอร์เป็นผู้ออกส่วนลด ไม่มีร้านยาลดน้ำหนัก/อาหารเสริมลดน้ำหนัก</p>
        ${can ? '' : '<div class="note">สัปดาห์นี้แลกไปแล้ว 1 ใบ แลกใหม่ได้วันจันทร์หน้า 🌱</div>'}
        <div class="partners">
          ${D.PARTNERS.map(
            (x) => `
            <div class="member">
              <span class="mini-avatar">${x.emoji}</span>
              <div class="grow"><b>${esc(x.offer)}</b><br/><small class="muted">${esc(x.name)}</small></div>
              <button class="btn small" data-action="redeem" data-v="${x.id}"${!can || p.coins < x.cost ? ' disabled' : ''}>🪙 ${x.cost}</button>
            </div>`
          ).join('')}
        </div>
      </section>
      ${
        coupons.length
          ? `<section class="card"><h3>คูปองของฉัน</h3>
              ${coupons
                .map((c) => {
                  const x = byId(D.PARTNERS, c.partnerId);
                  const st = L.couponStatus(c, t);
                  return `<div class="member coupon ${st}" data-action="${st === 'active' ? 'show-coupon' : ''}" data-v="${c.code}">
                    <span class="mini-avatar">${x.emoji}</span>
                    <div class="grow"><b>${esc(x.offer)}</b><br/><small class="muted">${esc(x.name)} · ${st === 'active' ? 'หมดอายุ ' + L.addDays(c.issuedKey, L.COUPON_DAYS - 1) : statusText[st]}</small></div>
                    <span class="pill">${statusText[st]}</span>
                  </div>`;
                })
                .join('')}
            </section>`
          : ''
      }`;
  }

  async function redeem(partnerId) {
    const x = byId(D.PARTNERS, partnerId);
    if (!x || !confirm('ใช้ ' + x.cost + ' เหรียญแลก “' + x.offer + '” ที่' + x.name + '?\nสัปดาห์นี้จะแลกได้แค่ใบนี้')) return;
    const r = await run('redeem', { partnerId });
    if (r) showCoupon(r.coupon.code);
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
    const c = P().coupons.find((x) => x.code === code);
    if (!c) return;
    const x = byId(D.PARTNERS, c.partnerId);
    openModal(`
      <div class="coupon-ticket">
        <div class="hero">${x.emoji}</div>
        <h2>${esc(x.offer)}</h2>
        <p class="muted">${esc(x.name)}</p>
        ${qrHtml(c.code)}
        <p class="code big-code">${c.code}</p>
        <p class="muted small">ใช้ได้ถึง ${L.addDays(c.issuedKey, L.COUPON_DAYS - 1)} · ให้พนักงานสแกนหรือกดยืนยันที่หน้าร้าน</p>
      </div>
      <button class="btn primary big" data-action="use-coupon" data-v="${c.code}">พนักงานกดยืนยันการใช้</button>
      <button class="btn big ghost-btn" data-action="close-modal">ปิด</button>`);
  }

  // ---------- me / settings ----------

  function viewMe() {
    const p = P();
    const t = today();
    const lv = L.levelFor(p.xp);
    const s = streak();
    const total = Object.keys(p.checkins).length;
    const days = Array.from({ length: 28 }, (_, i) => L.addDays(t, i - 27));
    return `
      <section class="card center">
        <div class="hero">${p.profile.avatar}</div>
        <h2>${esc(p.profile.nickname)}</h2>
        <p class="muted">${esc(schoolName())}${p.profile.unit ? ' · ' + esc(p.profile.unit) : ''}</p>
        <p>Lv.${lv.level} ${esc(lv.title)} · ${p.xp} XP</p>
      </section>
      <section class="card">
        <h3>พัฒนาการของฉัน 🌱</h3>
        <p class="muted small">วัดจากความสม่ำเสมอเท่านั้น ไม่มีการเทียบรูปร่าง</p>
        <div class="stat-row">
          <div><b>${total}</b><small>วันที่ขยับ</small></div>
          <div><b>${s.count}</b><small>streak ตอนนี้</small></div>
          <div><b>${p.cheersSent}</b><small>กำลังใจที่ส่ง</small></div>
        </div>
        <div class="heat">
          ${days.map((k) => `<span class="${p.checkins[k] ? (p.checkins[k].kind === 'full' ? 'full' : 'part') : s.frozenDays.includes(k) ? 'frozen' : ''}" title="${k}"></span>`).join('')}
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
          .map(([v, label]) => `<label class="radio"><input type="radio" name="vis" value="${v}" data-action="visibility"${p.visibility === v ? ' checked' : ''}/> ${label}</label>`)
          .join('')}
      </section>
      <section class="card">
        <h3>เป้าหมายของฉัน</h3>
        <div class="row between"><span>วันละ</span><select data-action="set-minutes">${[10, 15, 20, 30].map((m) => `<option${m === p.profile.minutes ? ' selected' : ''}>${m}</option>`).join('')}</select><span>นาที</span></div>
        <div class="row between"><span>สัปดาห์ละ</span><select data-action="set-days">${[3, 4, 5, 6, 7].map((d) => `<option${d === p.profile.daysPerWeek ? ' selected' : ''}>${d}</option>`).join('')}</select><span>วัน</span></div>
      </section>
      ${
        isRemote()
          ? `<section class="card">
              <h3>บัญชีของฉัน</h3>
              <p class="muted small">เข้าสู่ระบบเป็น <b>@${esc(snap.username)}</b> · เราไม่เก็บอีเมล เบอร์โทร หรือชื่อจริง</p>
              <div class="row wrap">
                <button class="btn small" data-action="export">⬇️ ดาวน์โหลดข้อมูลของฉัน</button>
                <button class="btn small" data-action="logout">ออกจากระบบ</button>
                <button class="btn small danger" data-action="delete-account">ลบบัญชี</button>
              </div>
            </section>`
          : ''
      }
      ${
        snap.devTools
          ? `<section class="card dev">
              <h3>🧪 เครื่องมือทดสอบ ${isRemote() ? '(เซิร์ฟเวอร์ทดสอบ)' : 'prototype (ออฟไลน์ เพื่อนจำลอง)'}</h3>
              <p class="muted small">วันที่ในแอป: ${t}${p.dayOffset ? ` (ข้ามมา ${p.dayOffset} วัน)` : ''}</p>
              <div class="row wrap">
                <button class="btn small" data-action="next-day">⏭️ ข้ามไปวันถัดไป</button>
                ${isRemote() ? '' : '<button class="btn small" data-action="export">⬇️ ส่งออกข้อมูลทดสอบ</button><button class="btn small danger" data-action="reset">เริ่มใหม่ทั้งหมด</button>'}
              </div>
            </section>`
          : ''
      }`;
  }

  async function exportData() {
    try {
      const data = await backend.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'activelift-' + (isRemote() ? 'my-data-' : 'test-') + today() + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast(e.message);
    }
  }

  // ---------- events ----------

  const actions = {
    'auth-mode'(v) {
      authMode = v;
      renderAuth();
    },
    'ob-next'() {
      readOnboardInputs();
      const err = validateStep();
      if (err) return toast(err);
      ui.onboardStep = Math.min(ONBOARD_STEPS - 1, ui.onboardStep + 1);
      saveUi();
      render();
    },
    'ob-back'() {
      readOnboardInputs();
      ui.onboardStep = Math.max(0, ui.onboardStep - 1);
      saveUi();
      render();
    },
    'ob-avatar'(v) {
      readOnboardInputs();
      ui.draft.avatar = v;
      saveUi();
      render();
    },
    'ob-interest'(v) {
      const list = ui.draft.interests;
      ui.draft.interests = list.includes(v) ? list.filter((x) => x !== v) : list.concat(v);
      saveUi();
      render();
    },
    'ob-level'(v) {
      ui.draft.level = v;
      render();
    },
    'ob-time'(v) {
      ui.draft.freeTime = v;
      render();
    },
    'ob-minutes'(v) {
      ui.draft.minutes = Number(v);
      render();
    },
    'ob-days'(v) {
      ui.draft.daysPerWeek = Number(v);
      render();
    },
    async 'ob-finish'() {
      if (await run('onboard', { profile: ui.draft })) {
        ui.onboardStep = 0;
        ui.tab = 'home';
        saveUi();
        toast('ยินดีต้อนรับ ' + P().profile.nickname + '! 🎉');
      }
    },
    tab(v) {
      if (v === 'season' && ui.tab !== 'season') run('fake-door', { key: 'views' });
      closeModal();
      ui.tab = v;
      saveUi();
      render();
      window.scrollTo(0, 0);
    },
    'season-view'(v) {
      ui.seasonView = v;
      saveUi();
      render();
    },
    'room-view'(v) {
      ui.roomView = v;
      saveUi();
      render();
    },
    'open-checkin': openCheckin,
    'ci-act': (v, el) => pickChip(el),
    'ci-kind': (v, el) => pickChip(el),
    'ci-mood': (v, el) => pickChip(el, true),
    'ci-submit': submitCheckin,
    'close-modal': closeModal,
    async survey(v) {
      closeModal();
      if ((await run('survey', { reason: v })) && v) toast('ขอบคุณที่บอกเรานะ เริ่มใหม่วันไหนก็ได้ 💛');
    },
    async 'reveal-friends'() {
      if (await run('visibility', { value: 'friends' })) toast('ตอนนี้กลุ่มเพื่อนสนิทเห็นคุณแล้ว 🌷');
    },
    'reveal-later': () => run('reveal-later'),
    async buy(v) {
      if (await run('buy', { id: v })) {
        const item = E.findItem(v);
        toast('ได้ ' + item.emoji + ' ' + item.name + ' แล้ว!');
      }
    },
    'toggle-item': (v) => run('toggle-item', { id: v }),
    async 'create-group'() {
      const r = await run('create-group', { name: document.getElementById('group-name').value });
      if (r) toast(r.simulated ? 'สร้างกลุ่มแล้ว! เพื่อนจำลอง ' + r.simulated + ' คนเข้าร่วม' : 'สร้างกลุ่มแล้ว! ส่งรหัส ' + r.code + ' ให้เพื่อนเลย');
    },
    async 'join-group'() {
      const r = await run('join-group', { code: document.getElementById('group-code').value });
      if (r) toast('เข้าร่วม ' + r.name + ' แล้ว 🏸');
    },
    async 'leave-group'() {
      if (confirm('ออกจากกลุ่มนี้ใช่ไหม? streak ส่วนตัวของคุณจะยังอยู่ครบ')) await run('leave-group');
    },
    cheer: openCheer,
    async 'cheer-msg'(v, el) {
      closeModal();
      const r = await run('cheer', { to: friendId(el.dataset.to), message: v });
      if (r) toast('ส่ง “' + v + '” ให้' + r.name + 'แล้ว');
    },
    'cheers-read': () => run('cheers-read'),
    visit: visitRoom,
    'find-buddy': findBuddy,
    async 'pick-buddy'(v) {
      closeModal();
      const r = await run('buddy-request', { to: friendId(v) });
      if (r) toast(r.accepted ? 'เริ่มช่วงลองคุยกับ' + r.name + 'แล้ว 🫶' : 'ส่งคำขอให้' + r.name + 'แล้ว รอตอบรับนะ 🫶');
    },
    async 'buddy-respond'(v) {
      const r = await run('buddy-respond', { accept: v === 'yes' });
      if (r) toast(r.accepted ? 'เริ่มช่วงลองคุยกันแล้ว 🫶' : 'ไม่เป็นไรเลย ขอบคุณที่ตอบนะ');
    },
    'buddy-stop-looking': () => run('buddy-stop-looking'),
    async 'buddy-link'() {
      const r = await run('buddy-link');
      if (r) toast(r.linked ? 'เป็นบัดดี้กันแล้ว 💞' : 'ยืนยันแล้ว รออีกฝ่ายยืนยันนะ');
    },
    async 'buddy-end'() {
      if (await run('buddy-end')) toast('ไม่เป็นไรเลย หาบัดดี้ใหม่ได้ตลอดนะ');
    },
    async 'buddy-report'() {
      const b = snap.social.buddy;
      if (!b || !confirm('รายงานและบล็อก ' + b.name + '? อีกฝ่ายจะไม่เห็นคุณอีก')) return;
      if (await run('buddy-report')) toast('เราได้รับรายงานแล้ว ขอบคุณที่บอกเรา 🙏');
    },
    claim(v) {
      const [track, i] = v.split(':');
      claimRewards('claim', { keys: [[track, Number(i)]] });
    },
    'claim-all': () => claimRewards('claim-all'),
    'buy-pass': openBuyPass,
    'pass-self': () => unlockPremiumTrial(),
    async 'pass-parent'() {
      await run('fake-door', { key: 'parentClicks' });
      const msg = parentMessage();
      // The message is also shown in the modal in case the clipboard is unavailable.
      if (navigator.clipboard) navigator.clipboard.writeText(msg).catch(() => {});
      unlockPremiumTrial(`<p class="label">ข้อความส่งให้ผู้ปกครอง</p><div class="note">${esc(msg)}</div>`);
    },
    async 'join-league'() {
      if (confirmSchoolVisibility() && (await run('visibility', { value: 'school' }))) toast('XP ของคุณช่วยโรงเรียนแล้ว 🏫');
    },
    trade: openTrade,
    async 'do-trade'(v, el) {
      closeModal();
      const r = await run('trade-offer', { to: friendId(el.dataset.to), card: v });
      if (!r) return;
      if (r.got) {
        const c = byId(D.PHOTOCARDS, r.got);
        toast('แลกกับ' + r.name + 'แล้ว ได้ ' + c.emoji + ' ' + c.name);
      } else toast('ส่งข้อเสนอให้' + r.name + 'แล้ว รอเพื่อนตอบนะ');
    },
    async 'trade-accept'(v, el) {
      const r = await run('trade-respond', { offerId: Number(el.dataset.offer), card: v });
      if (r) {
        const c = byId(D.PHOTOCARDS, r.got);
        toast('แลกกับ' + r.name + 'แล้ว ได้ ' + c.emoji + ' ' + c.name);
      }
    },
    'trade-decline': (v, el) => run('trade-respond', { offerId: Number(el.dataset.offer), card: null }),
    'invite-teacher': openTeacherInvite,
    redeem,
    'show-coupon': showCoupon,
    async 'use-coupon'(v) {
      if (!confirm('ยืนยันว่าพนักงานรับคูปองนี้แล้ว? ใช้ซ้ำไม่ได้')) return;
      closeModal();
      if (await run('use-coupon', { code: v })) toast('ใช้คูปองแล้ว ขอให้อร่อย/สนุกนะ 💛');
    },
    async 'next-day'() {
      if (await run('next-day')) toast('ข้ามไป ' + today());
    },
    export: exportData,
    reload: () => location.reload(),
    async reset() {
      if (!confirm('ลบข้อมูลทั้งหมดและเริ่มใหม่?')) return;
      const r = await backend.reset();
      Object.assign(ui, freshUi());
      saveUi();
      setSnapshot(r.snapshot);
    },
    async logout() {
      await backend.logout();
      Object.assign(ui, freshUi());
      saveUi();
      snap = null;
      authMode = 'login';
      render();
    },
    async 'delete-account'() {
      const pw = prompt('ลบบัญชีและข้อมูลทั้งหมดถาวร ย้อนกลับไม่ได้\nใส่รหัสผ่านเพื่อยืนยัน');
      if (!pw) return;
      try {
        await backend.deleteAccount(pw);
        Object.assign(ui, freshUi());
        saveUi();
        snap = null;
        authMode = 'register';
        render();
        toast('ลบบัญชีเรียบร้อยแล้ว');
      } catch (e) {
        toast(e.message);
      }
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || el.type === 'radio') return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el.dataset.v, el);
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'auth-form') return;
    e.preventDefault();
    submitAuth();
  });

  document.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.id === 'ob-school') {
      readOnboardInputs();
      saveUi();
      render();
      return;
    }
    const a = el.dataset.action;
    let ok = null;
    if (a === 'visibility') {
      if (el.value === 'school' && P().visibility !== 'school' && !confirmSchoolVisibility()) return render();
      ok = await run('visibility', { value: el.value });
    } else if (a === 'set-minutes') ok = await run('goal', { minutes: Number(el.value) });
    else if (a === 'set-days') ok = await run('goal', { daysPerWeek: Number(el.value) });
    else return;
    if (ok) toast('บันทึกแล้ว');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalRoot.hidden) closeModal();
  });

  async function boot() {
    app.innerHTML = '<main class="onboard"><div class="hero">🏸</div><p class="center muted">กำลังโหลด…</p></main>';
    backend = (await window.RemoteBackend.available()) ? new window.RemoteBackend() : new window.LocalBackend();
    try {
      const r = await backend.init();
      if (r.needsAuth) render();
      else setSnapshot(r.snapshot);
    } catch (e) {
      app.innerHTML = `<main class="onboard"><div class="hero">😵</div><p class="center">${esc(e.message)}</p><button class="btn primary big" data-action="reload">ลองใหม่</button></main>`;
    }
  }

  boot();
})();
