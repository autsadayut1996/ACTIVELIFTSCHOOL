# ขึ้นเซิร์ฟเวอร์ทดสอบ (สำหรับนักเรียน 10–15 คน)

คู่มือนี้พาขึ้นเซิร์ฟเวอร์บน [Fly.io](https://fly.io) ภูมิภาคสิงคโปร์ (`sin`) ซึ่งใกล้ไทยที่สุด ใช้ไฟล์ `Dockerfile` และ `fly.toml` ใน repo นี้ ฐานข้อมูล SQLite อยู่บน volume ถาวร มีสำรองข้อมูลอัตโนมัติทุกวัน

> ใช้ที่อื่นก็ได้: ทุกเครื่องที่รัน Docker ได้ (VPS ฯลฯ) ใช้ image เดียวกัน ดูหัวข้อ “รันบน VPS” ด้านล่าง

## สิ่งที่ต้องมี

- บัญชี Fly.io (ต้องผูกบัตร) — ค่าใช้จ่ายของเครื่องเล็ก 1 เครื่อง + volume 1GB อยู่ราวไม่กี่ดอลลาร์ต่อเดือน เช็คราคาล่าสุดที่ fly.io/pricing
- ติดตั้ง `flyctl`: <https://fly.io/docs/flyctl/install/>
- `openssl` (มีในเครื่อง Mac/Linux อยู่แล้ว) ไว้สร้างรหัสลับ

## ขั้นตอน (ครั้งแรก)

```bash
fly auth login

# 1) ตั้งชื่อแอปที่ไม่ซ้ำใคร แล้วแก้บรรทัด app = "..." ใน fly.toml ให้ตรงกัน
fly apps create activelift-school-pilot

# 2) สร้าง volume เก็บฐานข้อมูล (1GB เหลือเฟือสำหรับการทดสอบ)
fly volumes create activelift_data --region sin --size 1

# 3) สร้างรหัสเชิญ + token ของหน้าผลการทดสอบ แล้วจดเก็บไว้ (Fly จะไม่แสดงค่าลับให้ดูอีก)
echo "รหัสเชิญ:  PILOT-$(openssl rand -hex 3 | tr a-f A-F)"
echo "ADMIN_TOKEN: $(openssl rand -hex 24)"
fly secrets set REGISTRATION_CODE=<รหัสเชิญที่ได้> ADMIN_TOKEN=<token ที่ได้>

# 4) deploy และให้มีเครื่องเดียวเสมอ (SQLite ใช้ร่วมกันหลายเครื่องไม่ได้)
fly deploy
fly scale count 1
```

เสร็จแล้วจะได้:

| ลิงก์ | ใช้ทำอะไร |
| --- | --- |
| `https://<ชื่อแอป>.fly.dev/` | แอปจริง — ให้นักเรียนเปิดบนมือถือ สมัครด้วยรหัสเชิญ |
| `https://<ชื่อแอป>.fly.dev/landing/` | หน้าลงชื่อรอเปิดตัว |
| `https://<ชื่อแอป>.fly.dev/admin/` | หน้าผลการทดสอบของทีมงาน (ใส่ `ADMIN_TOKEN`) |

ตรวจว่าใช้ได้: `curl https://<ชื่อแอป>.fly.dev/api/health` ต้องได้ `{"ok":true,"inviteRequired":true}`

## อัปเดตเวอร์ชัน

```bash
git pull
fly deploy          # ข้อมูลอยู่บน volume ไม่หาย
```

## สำรองและกู้ข้อมูล

- เซิร์ฟเวอร์สำรองอัตโนมัติวันละครั้งไปที่ `/data/backups` (เก็บ 7 ไฟล์ล่าสุด) ด้วย `VACUUM INTO` ซึ่งได้สำเนาที่สมบูรณ์แม้มีคนใช้อยู่
- สำรองทันที: `fly ssh console -C "node server/backup.js /data/activelift.db /data/backups"`
- ดาวน์โหลดลงเครื่อง (ควรทำทุกสัปดาห์ เพราะ volume อยู่เครื่องเดียว):
  ```bash
  fly ssh console -C "ls /data/backups"
  fly ssh sftp get /data/backups/<ไฟล์>.db ./backup.db
  ```
- กู้คืน: `fly ssh sftp shell` → `put backup.db /data/restore.db` แล้ว
  ```bash
  fly ssh console -C "sh -c 'cp /data/restore.db /data/activelift.db && rm -f /data/activelift.db-wal /data/activelift.db-shm'"
  fly apps restart <ชื่อแอป>
  ```

## ค่าตั้งค่า (environment variables)

| ตัวแปร | ค่าใน image | ความหมาย |
| --- | --- | --- |
| `REGISTRATION_CODE` | (secret) | ถ้าตั้งไว้ ต้องใช้รหัสนี้ตอนสมัคร (ไม่สนตัวพิมพ์เล็ก/ใหญ่) |
| `ADMIN_TOKEN` | (secret) | เปิด `/api/admin/metrics` และหน้า `/admin/` ถ้าไม่ตั้ง หน้าผลจะใช้ไม่ได้ |
| `TRUST_PROXY` | `1` | เชื่อ `X-Forwarded-*` จาก proxy ของ Fly (ใช้ rate limit ต่อ IP จริง + HSTS) — **ตั้งเป็น 1 เฉพาะเมื่ออยู่หลัง proxy** |
| `DB_PATH` | `/data/activelift.db` | ไฟล์ฐานข้อมูล |
| `BACKUP_DIR` / `BACKUP_HOURS` | `/data/backups` / 24 | ที่เก็บและความถี่ของการสำรอง |
| `DEV_TIME_TRAVEL` | ปิด | เปิดปุ่มข้ามวัน — ใช้กับเซิร์ฟเวอร์เดโมภายในเท่านั้น ห้ามเปิดตอนทดสอบกับนักเรียนจริง เพราะทำให้ตัวเลข retention เพี้ยน |

## รันบน VPS (ทางเลือก)

```bash
docker build -t activelift-school .
docker volume create activelift_data
docker run -d --name activelift --restart unless-stopped \
  -p 127.0.0.1:8080:8080 -v activelift_data:/data \
  -e REGISTRATION_CODE=PILOT-XXXX -e ADMIN_TOKEN=<random> \
  activelift-school
```

แล้ววาง reverse proxy ที่ทำ HTTPS ไว้ข้างหน้า (เช่น Caddy: `your-domain { reverse_proxy 127.0.0.1:8080 }`) — ถ้าไม่มี proxy ให้ตั้ง `-e TRUST_PROXY=0`

## เช็คลิสต์วันทดสอบ

**ก่อนเริ่ม**
- [ ] ส่งหนังสือแจ้ง/ขอความยินยอมผู้ปกครอง อธิบายว่าเก็บข้อมูลอะไร (ชื่อผู้ใช้, ชื่อเล่น, โรงเรียน, การเช็คอิน — ไม่มีอีเมล/ชื่อจริง/น้ำหนัก) และลบบัญชีได้เองในแท็บ “ฉัน”
- [ ] ทดสอบสมัคร + เช็คอินเองบนมือถือ 1 รอบ แล้วลบบัญชีทดสอบทิ้ง
- [ ] แบ่งนักเรียน 2 กลุ่มตามแผน: กลุ่มที่ไม่มั่นใจในรูปร่าง กับกลุ่มที่ active อยู่แล้ว

**วันแรก**
- [ ] ให้รหัสเชิญแบบเจอตัวหรือในกลุ่ม LINE ปิด (อย่าโพสต์สาธารณะ)
- [ ] แนะนำให้กด “เพิ่มไปที่หน้าจอหลัก” จะได้เปิดเหมือนแอป
- [ ] ให้แต่ละกลุ่มเพื่อนสร้าง/เข้ากลุ่มด้วยรหัสกลุ่ม ส่วนคนที่มาคนเดียวลอง “หาบัดดี้”
- [ ] ย้ำว่าช่วงแรกไม่มีใครเห็นใคร และเปิดการมองเห็นเมื่อพร้อม

**ระหว่างทดสอบ**
- [ ] เปิด `/admin/` ทุกวัน: ดูช่อง “รายงาน (ต้องตรวจ)” ถ้ามากกว่า 0 ให้ติดต่อผู้ใช้ที่เกี่ยวข้อง
- [ ] ดาวน์โหลด backup ทุกสัปดาห์

**วันที่ 7 และ 14**
- [ ] จดตัวเลขจาก `/admin/`: กลับมาวันที่ 2 / วันที่ 7, North Star (สัปดาห์ที่ 2 พร้อมเพื่อน), เหตุผลที่ streak ขาด, ราคา 59 vs 99, จำนวนชวนครูพละ
- [ ] สัมภาษณ์ 5–10 คน (ทั้งคนที่ยังใช้และคนที่เลิกไปแล้ว) ตามแผนส่วนที่ 10
- [ ] ถ้าผลชี้ว่าสมมติฐานผิด ย้อนกลับไปแก้ที่ขั้น Define ก่อนเพิ่มฟีเจอร์
