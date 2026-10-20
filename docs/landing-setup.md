# Landing page + fake door test

หน้า `landing/index.html` ใช้วัดความสนใจก่อนสร้างแอปจริง (ขั้น Prototype ในแผนธุรกิจส่วนที่ 9)

## สิ่งที่หน้านี้ทดสอบ

| คำถาม | วัดจาก |
| --- | --- |
| ข้อความหลักแบบไหนดึงคนได้มากกว่า | A/B headline: `safe` (“ไม่มีใครตัดสินรูปร่างใคร”) vs `game` (“เปลี่ยนการออกกำลังกายให้เป็นเกม”) เทียบอัตราลงชื่อ ต่อผู้เข้าชมไม่ซ้ำ ตรวจสมมติฐานในแผนว่า “ความปลอดภัยทางใจ” ควรเป็นข้อความหลักตอนเปิดตัว |
| โรงเรียนไหนควรเปิดก่อน | จำนวนลงชื่อแยกตาม `school` (แก้ cold-start ของ School League) |
| ใครสนใจ | `role`: นักเรียน / นักศึกษา / ผู้ปกครอง / ครู (ครู = ลีด B2B2C) |
| กีฬาแร็กเก็ตมาแรงจริงไหม | `interests` ที่เลือก (badminton, tennis, pingpong) |
| คนชวนเพื่อนต่อไหม | event `share-line`, `share-copy` และผู้เข้าชมที่มาจาก `src=friend` |

ทุก event มี `variant`, `visitor` (id สุ่มต่อเบราว์เซอร์), `source` (`?utm_source=` / `?src=` / referrer) และเวลา

Event ที่เก็บ: `visit`, `cta-nav`, `cta-hero`, `cta-demo`, `cta-school`, `form_view`, `signup_error`, `signup`, `share-line`, `share-copy`, `cta-demo-after`

## เก็บผลลง Google Sheets (ไม่ต้องมีเซิร์ฟเวอร์)

1. สร้าง Google Sheet ใหม่ → **Extensions → Apps Script**
2. วางโค้ดนี้แล้วกด Save

```js
const SHEET = 'events';
const TYPES = ['visit', 'cta-nav', 'cta-hero', 'cta-demo', 'cta-school', 'form_view', 'signup_error', 'signup', 'share-line', 'share-copy', 'cta-demo-after'];
const HEADER = ['at', 'type', 'variant', 'visitor', 'source', 'role', 'school', 'schoolOther', 'email', 'interests'];

function doPost(e) {
  const ev = JSON.parse(e.postData.contents);
  if (!TYPES.includes(ev.type)) return ContentService.createTextOutput('ignored');
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) sh.appendRow(HEADER);
  const clip = (v) => String(v == null ? '' : v).slice(0, 200);
  sh.appendRow([
    clip(ev.at), clip(ev.type), clip(ev.variant), clip(ev.visitor), clip(ev.source),
    clip(ev.role), clip(ev.school), clip(ev.schoolOther), clip(ev.email), clip((ev.interests || []).join(',')),
  ]);
  return ContentService.createTextOutput('ok');
}
```

3. **Deploy → New deployment → Web app**: Execute as = *Me*, Who has access = *Anyone* → คัดลอก URL
4. ใส่ URL ใน `landing/landing.js` ที่ `const ENDPOINT = '';` แล้ว commit

## เปิดหน้าให้คนเข้าได้

หน้าเป็นไฟล์ static ล้วน (ใช้ `../js/data.js` ร่วมกับ prototype) โฮสต์ทั้ง repo ได้เลย เช่น GitHub Pages (Settings → Pages → Deploy from branch) แล้วแชร์ลิงก์ `.../landing/`

แนะนำใส่ `?utm_source=` ต่อช่องทาง เช่น `?utm_source=tiktok`, `?utm_source=line-group`, `?utm_source=school-poster` จะได้รู้ว่าช่องทางไหนได้ผล

## อ่านผล

ในชีต `events` ใช้สูตร Google Sheets:

- ผู้เข้าชมไม่ซ้ำ: `=COUNTUNIQUEIFS(D:D, B:B, "visit", C:C, "safe")`
- ลงชื่อ: `=COUNTIFS(B:B, "signup", C:C, "safe")`
- อัตราลงชื่อ = ลงชื่อ ÷ ผู้เข้าชมไม่ซ้ำ (ทำซ้ำกับ `game`)
- ลงชื่อแยกโรงเรียน: Insert → Pivot table, Rows = `school`, Filter `type` = `signup`

ควรมีผู้เข้าชมอย่างน้อยราว 100–200 คนต่อ variant ก่อนสรุป ถ้าต่างกันไม่ถึงไม่กี่จุด % ถือว่ายังบอกไม่ได้

ทดสอบในเครื่อง: เปิด `landing/index.html?debug` จะเห็นตัวนับ funnel ต่อ variant ของเบราว์เซอร์นั้น, บังคับ variant ได้ด้วย `?v=safe` หรือ `?v=game`

## ข้อมูลส่วนบุคคล (PDPA)

- เก็บแค่อีเมลเป็นข้อมูลติดต่อ พร้อม checkbox ยินยอม และใช้เพื่อแจ้งข่าวเปิดตัวเท่านั้น
- ก่อนเปิดใช้จริงควรมีหน้านโยบายความเป็นส่วนตัวและช่องทางขอลบข้อมูล (เช่น อีเมลติดต่อ) และจำกัดสิทธิ์คนที่เปิด Google Sheet ได้
- กลุ่มเป้าหมายส่วนใหญ่อายุต่ำกว่า 20 ปี ฟอร์มจึงแนะนำให้แจ้งผู้ปกครองก่อน ควรปรึกษาผู้เชี่ยวชาญกฎหมายเรื่องความยินยอมของผู้เยาว์ก่อนเก็บข้อมูลจำนวนมาก
