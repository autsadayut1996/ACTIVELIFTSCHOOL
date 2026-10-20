# Backend (เซิร์ฟเวอร์จริง)

เซิร์ฟเวอร์ Node.js ไม่มี dependency ภายนอก ใช้ `node:http` + `node:sqlite` (ต้องใช้ Node 22.13 ขึ้นไป) เก็บข้อมูลผู้ใช้จริงและข้อมูลที่ใช้ร่วมกันข้ามเครื่อง: บัญชี, เช็คอิน, กลุ่มเพื่อนสนิท, กำลังใจ, บัดดี้, แลกการ์ด, คูปอง, School League และทัวร์นาเมนต์

## รัน

```bash
npm run server   # http://localhost:8080 (โหมดใช้งานจริง)
npm run dev      # เหมือนกัน แต่เปิดปุ่ม "ข้ามไปวันถัดไป" สำหรับทดสอบ
npm test         # unit + integration tests ทั้งหมด
```

ตัวแปรแวดล้อม: `PORT` (8080), `HOST` (0.0.0.0), `DB_PATH` (`server/data/activelift.db`), `DEV_TIME_TRAVEL=1` (เปิดการข้ามวัน — ห้ามเปิดบนเซิร์ฟเวอร์จริง)

เซิร์ฟเวอร์เสิร์ฟทั้งแอป (`/`), landing page (`/landing/`) และ API (`/api/*`) จาก origin เดียวกัน

## สองโหมดของแอป

| เปิดแอปจาก | โหมด | ข้อมูล |
| --- | --- | --- |
| เซิร์ฟเวอร์นี้ (`/api/health` ตอบ) | **ออนไลน์** — สมัคร/เข้าสู่ระบบ | ผู้ใช้จริง เก็บใน SQLite |
| ไฟล์ตรงๆ หรือ static hosting (GitHub Pages) | **ออฟไลน์** | ในเบราว์เซอร์ + เพื่อนจำลอง (เหมือน prototype เดิม) |

```
js/logic.js    กฎล้วน (streak, XP, ซีซั่น, League, ทัวร์นาเมนต์)  ─┐
js/data.js     ข้อมูลเกม                                         ├─ ใช้ร่วมกันทั้งเบราว์เซอร์และเซิร์ฟเวอร์
js/engine.js   action ของผู้เล่น 1 คน + validation               ─┘
js/local.js    LocalBackend  (ออฟไลน์, เพื่อนจำลอง)
js/remote.js   RemoteBackend (เรียก API)
js/app.js      UI ล้วน: แสดง snapshot และส่ง action ผ่าน backend
server/        index.js (HTTP), game.js (snapshot + action ที่เกี่ยวกับผู้ใช้อื่น), db.js (schema), auth.js
```

ทุก action (เช็คอิน, ซื้อของ, รับรางวัล Pass, แลกคูปอง ฯลฯ) **คำนวณบนเซิร์ฟเวอร์** ด้วย `engine.js` ตัวเดียวกับฝั่งเบราว์เซอร์ ผู้ใช้แก้ XP/เหรียญ/ของเองไม่ได้ วันที่ใช้ปฏิทินเวลาไทย (Asia/Bangkok)

## API

ทุก endpoint รับ/ส่ง JSON; endpoint ที่ต้องล็อกอินใช้ `Authorization: Bearer <token>`

| Method | Path | ใช้ทำอะไร |
| --- | --- | --- |
| GET | `/api/health` | เช็คว่าเซิร์ฟเวอร์ทำงาน |
| POST | `/api/register` | `{username, password}` → `{token, snapshot}` |
| POST | `/api/login` | `{username, password}` → `{token, snapshot}` |
| POST | `/api/logout` | ยกเลิก token |
| GET | `/api/me` | `{snapshot}` |
| POST | `/api/action` | `{action, args}` → `{result, snapshot}` |
| GET | `/api/export` | ดาวน์โหลดข้อมูลทั้งหมดของตัวเอง |
| POST | `/api/delete-account` | `{password}` ลบบัญชีและข้อมูลถาวร |

`snapshot` = `{ mode, today, username, player, social: {group, buddy, buddyRequests, cheers, tradeOffers, outgoingTrades}, league, tournament, events, devTools }`

Actions: `onboard`, `checkin`, `survey`, `visibility`, `reveal-later`, `goal`, `buy`, `toggle-item`, `claim`, `claim-all`, `unlock-premium`, `fake-door`, `redeem`, `use-coupon`, `create-group`, `join-group`, `leave-group`, `cheer`, `cheers-read`, `buddy-find`, `buddy-stop-looking`, `buddy-request`, `buddy-respond`, `buddy-link`, `buddy-end`, `buddy-report`, `trade-offer`, `trade-respond`, `next-day` (เฉพาะ `DEV_TIME_TRAVEL=1`)

## กติกาความปลอดภัยและความเป็นส่วนตัวที่บังคับบนเซิร์ฟเวอร์

- **บัญชี:** ชื่อผู้ใช้ + รหัสผ่านเท่านั้น ไม่เก็บอีเมล เบอร์โทร หรือชื่อจริง; รหัสผ่าน hash ด้วย scrypt + salt; token สุ่ม 256 บิต เก็บเป็น SHA-256 อายุ 30 วัน; จำกัดการลอง login/สมัคร 20 ครั้ง/15 นาที ต่อ IP
- **การมองเห็น:** สมาชิกกลุ่มเห็น streak และมินิรูมของเพื่อนเฉพาะเมื่อเพื่อนเปิดการมองเห็น (ไม่ใช่ “เฉพาะฉัน”); บัดดี้ที่ตกลงกันแล้วเห็น streak กันได้แม้อยู่ในโหมดไม่มีใครเห็น
- **League/ทัวร์นาเมนต์:** นับเฉพาะผู้ใช้ที่เลือก “ทั้งโรงเรียน” เอง และแสดงเป็นตัวเลขรวมของโรงเรียนเท่านั้น
- **บัดดี้:** เป็นตัวเลือกให้คนอื่นเฉพาะเมื่อกด “หาบัดดี้” เอง (ปิดได้), สถาบันเดียวกันเท่านั้น, ต้องอีกฝ่ายตอบรับ, ช่วงลองคุย 3 วันก่อนยืนยันทั้งคู่, รายงาน/บล็อกได้ (บันทึกในตาราง `reports`) และคนที่ถูกบล็อกจับคู่/ส่งกำลังใจ/แลกการ์ดไม่ได้อีก
- **การสื่อสาร:** ไม่มีแชทอิสระ ส่งได้เฉพาะข้อความให้กำลังใจสำเร็จรูป ถึงเพื่อนในกลุ่มหรือบัดดี้ จำกัด 30 ครั้ง/วัน
- **คูปอง:** รหัสสุ่มฝั่งเซิร์ฟเวอร์ ไม่ซ้ำกันทั้งระบบ (ตาราง `coupons` ไว้ให้ร้านตรวจสอบภายหลัง)
- **HTTP:** CSP (`script-src 'self'`), `X-Frame-Options: DENY`, `nosniff`, จำกัด body 32KB, เสิร์ฟไฟล์เฉพาะ `index.html`, `css/`, `js/`, `landing/` (โค้ดเซิร์ฟเวอร์และฐานข้อมูลเข้าถึงจากเว็บไม่ได้)
- **PDPA:** ผู้ใช้ดาวน์โหลดข้อมูลตัวเองได้ (`/api/export`) และลบบัญชีได้เอง ข้อมูลที่เกี่ยวข้องถูกลบตาม (cascade)

## ก่อนเปิดใช้จริง (ยังไม่ได้ทำ)

- **Hosting:** ต้องรันบนเครื่องที่มี disk ถาวร (เช่น VPS, Fly.io/Railway ที่มี volume) หลัง HTTPS reverse proxy; ตั้ง backup ไฟล์ SQLite สม่ำเสมอ ถ้าผู้ใช้หลักหมื่นขึ้นไปค่อยย้ายไป PostgreSQL
- **การชำระเงิน:** Premium ยังเป็น fake door (ปลดล็อกฟรี) ต้องต่อ App Store/Google Play IAP หรือ payment gateway ไทย และตรวจใบเสร็จฝั่งเซิร์ฟเวอร์
- **ร้านค้าพาร์ทเนอร์:** ยังไม่มีหน้าให้ร้านสแกน/ยืนยันคูปอง (ตอนนี้ผู้ใช้กดยืนยันเองแทนพนักงาน)
- **การดูแลชุมชน:** ต้องมีหน้าแอดมินดูตาราง `reports` และระงับบัญชี
- **บัญชีผู้เยาว์:** ทบทวนเรื่องความยินยอมผู้ปกครองตาม PDPA กับผู้เชี่ยวชาญกฎหมาย และเพิ่มหน้านโยบายความเป็นส่วนตัว
- **กู้รหัสผ่าน:** ยังไม่มี (เพราะไม่เก็บอีเมล) — อาจใช้ recovery code ตอนสมัคร หรือให้ครู/โรงเรียนรีเซ็ตให้
- **Rate limit** ตอนนี้อยู่ในหน่วยความจำของ process เดียว ถ้ารันหลาย instance ต้องย้ายไปเก็บร่วมกัน
- `node:sqlite` ยังเป็นฟีเจอร์ experimental ของ Node 22 (เสถียรใน Node รุ่นถัดไป)
