// Team dashboard for test results: fetches /api/admin/metrics with the admin token.
(function () {
  'use strict';

  const D = window.Data;
  const out = document.getElementById('out');
  const KEY = 'activelift-admin-token';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  const name = (list, id) => {
    const x = list.find((i) => i.id === id);
    return x ? x.name : id;
  };

  function table(title, obj, label, note) {
    const rows = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
    return `<section class="card"><h3>${title}</h3>${note ? `<p class="muted small">${note}</p>` : ''}
      ${rows.length ? `<table>${rows.map(([k, v]) => `<tr><td>${esc(label ? label(k) : k)}</td><td class="num">${v}</td></tr>`).join('')}</table>` : '<p class="muted small">ยังไม่มีข้อมูล</p>'}</section>`;
  }

  function kpi(title, r, note) {
    return `<section class="card kpi"><h3>${title}</h3><b>${r.percent === null ? '–' : r.percent + '%'}</b>
      <p class="muted small">${r.returned}/${r.eligible} คน${note ? ' · ' + note : ''}</p></section>`;
  }

  function render(m) {
    const p = m.pricing;
    out.innerHTML = `
      <div class="row between"><h2>ผลการทดสอบ ActiveLift School</h2><button class="btn small" id="refresh">รีเฟรช</button></div>
      <p class="muted small">อัปเดต ${new Date(m.generatedAt).toLocaleString('th-TH')} · ผู้ใช้ ${m.users.onboarded} คน (สมัคร ${m.users.registered}) · ไม่มีข้อมูลระบุตัวบุคคล</p>
      <div class="grid">
        ${kpi('🌟 North Star', m.retention.northStar, 'กลับมาสัปดาห์ที่ 2 พร้อมเพื่อน ≥1 คน')}
        ${kpi('กลับมาวันที่ 2', m.retention.day2)}
        ${kpi('กลับมาวันที่ 7', m.retention.day7)}
        <section class="card kpi"><h3>เช็คอินทั้งหมด</h3><b>${m.checkins.total}</b><p class="muted small">แบบ “ได้นิดหน่อย” ${m.checkins.partialPercent ?? '–'}%</p></section>
      </div>
      <section class="card"><h3>💸 ทดสอบราคา Premium (fake door)</h3>
        <table><tr><th>ราคา</th><th class="num">ผู้เล่น</th><th class="num">เปิดแท็บซีซั่น</th><th class="num">กดดู Premium</th><th class="num">ขอผู้ปกครอง</th><th class="num">กดดู/ผู้เล่น</th></tr>
        ${Object.entries(p).map(([v, t]) => `<tr><td>${esc(v)}${v === 'not seen' ? '' : ' บาท'}</td><td class="num">${t.players}</td><td class="num">${t.views}</td><td class="num">${t.buyClicks}</td><td class="num">${t.parentClicks}</td><td class="num">${t.players ? Math.round((t.buyClicks / t.players) * 100) + '%' : '–'}</td></tr>`).join('')}
        </table></section>
      <div class="grid">
        ${table('😮‍💨 เหตุผลที่ streak ขาด', m.exitSurvey, (k) => (k === 'skipped' ? 'ข้าม' : k))}
        ${table('🏸 กิจกรรมที่เช็คอิน', m.checkins.byActivity, (k) => name(D.ACTIVITIES, k))}
        ${table('🙂 อารมณ์หลังขยับ', m.checkins.moods, (k) => (k === 'none' ? 'ไม่ได้เลือก' : name(D.MOODS, k)))}
        ${table('👻 ระดับการมองเห็น', m.privacy.visibility, (k) => ({ self: 'เฉพาะฉัน', friends: 'เพื่อนสนิท', class: 'ห้อง/คณะ', school: 'ทั้งโรงเรียน' })[k] || k)}
        ${table('🏫 ผู้ใช้ต่อสถาบัน', m.schools, (k) => name(D.SCHOOLS, k))}
        ${table('🧑‍🏫 ชวนครูพละ (B2B2C)', m.teacherInvitesBySchool, (k) => name(D.SCHOOLS, k), 'จำนวนครั้งที่นักเรียนกดชวนโรงเรียนเข้าร่วม')}
        ${table('🤝 คอมมิวนิตี้', { 'กลุ่ม': m.social.groups, 'สมาชิกในกลุ่ม': m.social.groupMembers, 'กำลังใจที่ส่ง': m.social.cheers, 'แลกการ์ดสำเร็จ': m.social.tradesDone, 'รายงาน (ต้องตรวจ)': m.social.reports })}
        ${table('🫶 บัดดี้ตามสถานะ', m.social.buddies)}
        ${table('🎁 คูปองที่แลก', m.coupons.issued, (k) => name(D.PARTNERS, k), `ใช้แล้ว ${m.coupons.used} ใบ`)}
      </div>`;
    document.getElementById('refresh').onclick = load;
  }

  async function load() {
    const token = sessionStorage.getItem(KEY);
    if (!token) return;
    const res = await fetch('/api/admin/metrics', { headers: { Authorization: 'Bearer ' + token } }).catch(() => null);
    if (!res || !res.ok) {
      sessionStorage.removeItem(KEY);
      document.getElementById('login').hidden = false;
      document.getElementById('error').textContent = res ? 'token ไม่ถูกต้อง หรือเซิร์ฟเวอร์ยังไม่ได้ตั้ง ADMIN_TOKEN' : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
      return;
    }
    document.getElementById('login').hidden = true;
    render(await res.json());
  }

  document.getElementById('token-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sessionStorage.setItem(KEY, document.getElementById('token').value.trim());
    load();
  });

  load();
})();
