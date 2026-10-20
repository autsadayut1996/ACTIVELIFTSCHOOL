// Landing page + fake door test for ActiveLift School.
(function () {
  'use strict';

  // Paste a Google Apps Script web-app URL here (see docs/landing-setup.md) to collect
  // results in a Google Sheet. Left empty, events are only kept in this browser.
  const ENDPOINT = '';

  const D = window.Data;
  const STORE = 'activelift-landing-v1';

  // Headline A/B test: does "psychological safety" convert better than "game + competition"?
  const VARIANTS = {
    safe: {
      headline: 'ออกกำลังกายกับเพื่อนจริง<br/>ไม่มีใครตัดสินรูปร่างใคร',
      subhead: 'ไม่ถามน้ำหนัก ไม่มี BMI ได้ XP จากความสม่ำเสมอ ช่วงแรกไม่มีใครเห็นคุณจนกว่าจะพร้อม',
    },
    game: {
      headline: 'เปลี่ยนการออกกำลังกาย<br/>ให้เป็นเกมกับเพื่อน',
      subhead: 'เก็บ XP แต่งมินิรูม สะสมการ์ด แล้วพาโรงเรียนของคุณขึ้นอันดับ 1 ใน School League',
    },
  };

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE)) || {};
    } catch (e) {
      return {};
    }
  }

  const store = Object.assign({ events: [], signedUp: false }, load());

  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify(store));
    } catch (e) {
      /* ignore */
    }
  }

  // ?v=safe or ?v=game forces a variant; otherwise each visitor keeps a random one.
  const params = new URLSearchParams(location.search);
  if (VARIANTS[params.get('v')]) store.variant = params.get('v');
  if (!store.variant) store.variant = Math.random() < 0.5 ? 'safe' : 'game';
  if (!store.visitorId) store.visitorId = Math.random().toString(36).slice(2, 10);
  const source = params.get('utm_source') || params.get('src') || (document.referrer ? new URL(document.referrer).hostname : 'direct');

  function track(type, extra) {
    const event = Object.assign({ type, variant: store.variant, visitor: store.visitorId, source, at: new Date().toISOString() }, extra || {});
    store.events.push(event);
    persist();
    if (ENDPOINT) {
      // text/plain + no-cors keeps this a simple request that Apps Script accepts without CORS setup.
      fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(event), keepalive: true }).catch(() => {});
    }
    renderDebug();
  }

  // ---------- content ----------

  document.getElementById('headline').innerHTML = VARIANTS[store.variant].headline;
  document.getElementById('subhead').textContent = VARIANTS[store.variant].subhead;

  const schoolSel = document.getElementById('school');
  D.SCHOOLS.forEach((s) => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.name;
    schoolSel.appendChild(o);
  });

  const interestsEl = document.getElementById('interests');
  D.ACTIVITIES.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.v = a.id;
    b.textContent = a.emoji + ' ' + a.name;
    interestsEl.appendChild(b);
  });

  // ---------- interactions ----------

  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) {
      const group = chip.parentElement;
      if (group.classList.contains('multi')) chip.classList.toggle('on');
      else group.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === chip));
      return;
    }
    const t = e.target.closest('[data-track]');
    if (t) {
      track(t.dataset.track);
      if (t.dataset.role) selectRole(t.dataset.role);
    }
  });

  function selectRole(role) {
    document.querySelectorAll('#role .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === role));
  }

  schoolSel.addEventListener('change', () => {
    document.getElementById('school-other-wrap').classList.toggle('hidden', schoolSel.value !== 'other');
  });

  // Count a "form view" once, when the form scrolls into sight.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) {
        track('form_view');
        io.disconnect();
      }
    });
    io.observe(document.getElementById('signup-form'));
  }

  const form = document.getElementById('signup-form');
  const errorEl = document.getElementById('form-error');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const role = document.querySelector('#role .chip.on').dataset.v;
    const school = schoolSel.value;
    const schoolOther = document.getElementById('school-other').value.trim();
    const email = document.getElementById('email').value.trim();
    const interests = Array.from(document.querySelectorAll('#interests .chip.on')).map((c) => c.dataset.v);
    const consent = document.getElementById('consent').checked;

    let err = '';
    if (!school) err = 'เลือกโรงเรียน/มหาวิทยาลัยก่อนนะ';
    else if (school === 'other' && !schoolOther) err = 'พิมพ์ชื่อสถาบันก่อนนะ';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err = 'อีเมลดูไม่ถูกต้อง ลองเช็คอีกทีนะ';
    else if (!consent) err = 'ติ๊กยินยอมก่อนนะ เราใช้อีเมลแจ้งข่าวเปิดตัวเท่านั้น';
    errorEl.textContent = err;
    if (err) {
      track('signup_error', { reason: err });
      return;
    }

    track('signup', { role, school, schoolOther, email, interests });
    store.signedUp = true;
    store.schoolName = school === 'other' ? schoolOther : D.SCHOOLS.find((s) => s.id === school).name;
    persist();
    showThanks();
  });

  function shareUrl() {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('src', 'friend');
    return u.toString();
  }

  function showThanks() {
    document.getElementById('form-area').classList.add('hidden');
    document.getElementById('thanks').classList.remove('hidden');
    document.getElementById('thanks-school').textContent = ' ' + (store.schoolName || 'โรงเรียนเดียวกัน') + ' ';
    const text = 'มาลงชื่อ ActiveLift School ด้วยกัน! แอปออกกำลังกายกับเพื่อนที่ไม่มีใครตัดสินรูปร่างใคร 🏸 ';
    document.getElementById('share-line').href = 'https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(shareUrl()) + '&text=' + encodeURIComponent(text);
  }

  document.getElementById('share-copy').addEventListener('click', (e) => {
    track('share-copy');
    const btn = e.currentTarget;
    const done = () => (btn.textContent = 'คัดลอกแล้ว ✓');
    if (navigator.clipboard) navigator.clipboard.writeText(shareUrl()).then(done, () => (btn.textContent = shareUrl()));
    else btn.textContent = shareUrl();
  });

  if (store.signedUp) showThanks();

  // ---------- ?debug: local funnel per variant for testing ----------

  function renderDebug() {
    if (!params.has('debug')) return;
    const el = document.getElementById('debug');
    el.classList.remove('hidden');
    const rows = Object.keys(VARIANTS).map((v) => {
      const ev = store.events.filter((x) => x.variant === v);
      const n = (t) => ev.filter((x) => x.type === t).length;
      return `<tr><td>${v}</td><td>${n('visit')}</td><td>${ev.filter((x) => x.type.startsWith('cta')).length}</td><td>${n('form_view')}</td><td>${n('signup')}</td></tr>`;
    });
    el.innerHTML = `<b>debug · variant: ${store.variant} · endpoint: ${ENDPOINT ? 'on' : 'off (local only)'}</b>
      <table><tr><th>variant</th><th>visit</th><th>cta</th><th>form</th><th>signup</th></tr>${rows.join('')}</table>
      <button type="button" id="dbg-reset">reset this browser</button>`;
    document.getElementById('dbg-reset').onclick = () => {
      localStorage.removeItem(STORE);
      location.href = location.pathname + '?debug';
    };
  }

  track('visit', { landing: location.pathname });
})();
