# Duo 💞 พื้นที่ของเราสองคน

เว็บแอป (PWA) สำหรับคู่รัก รวมปฏิทินร่วม รายการ เช็กอินประจำวัน แผนร่วมกัน และบันทึกไว้ในที่เดียว ติดตั้งลงหน้าจอได้ทั้ง iOS และ Android และสั่งงานผ่าน Claude ด้วย MCP ได้

## Stack

| ส่วน | ใช้อะไร |
|---|---|
| Framework | Next.js App Router บน **vinext** (Next.js API บน Vite ซึ่ง Cloudflare แนะนำสำหรับ Workers) |
| UI | shadcn/ui (new-york) + Tailwind v4 + lucide-react |
| Hosting | Cloudflare Workers (Worker เดียวรวมเว็บ + OAuth + MCP) |
| Database | Cloudflare D1 + Drizzle ORM (migrate อัตโนมัติตอน request แรก) |
| MCP | `@modelcontextprotocol/server` v2 + `agents/mcp/server` (`createMcpHandler`, stateless) |
| OAuth (สำหรับ MCP) | `@cloudflare/workers-oauth-provider` (DCR + CIMD + PKCE) เก็บใน KV |
| Auth เว็บ | email + password (PBKDF2 ผ่าน WebCrypto) + session cookie ใน D1 |

## ฟีเจอร์

- **จับคู่**: สมัครแล้วสร้างพื้นที่คู่ จากนั้นส่งโค้ดเชิญให้แฟนเข้าร่วม (พื้นที่ละ 2 คน)
- **ภาพรวม (Dashboard)**: สถานะเช็กอินของทั้งคู่ อารมณ์ 7 วัน นัด 7 วันข้างหน้า งานค้าง ความคืบหน้าของแผน และจำนวนวันที่อยู่ด้วยกัน
- **ปฏิทิน**: มุมมองรายเดือน เพิ่มหรือลบนัด ระบุเวลาหรือตั้งเป็นทั้งวันได้
- **รายการ**: งานบ้าน ของต้องซื้อ wishlist ที่อยากไป มอบหมายคนทำและตั้งกำหนดส่งได้
- **เช็กอินประจำวัน**: บันทึกอารมณ์ พลังงาน เรื่องที่ขอบคุณ และ "วันนี้อยากได้อะไรจากเธอ" พร้อมนับ streak
  🔒 จะเห็นคำตอบของอีกฝ่ายก็ต่อเมื่อตัวเองเช็กอินวันนั้นแล้ว (กฎนี้ใช้ทั้งบนเว็บและผ่าน MCP)
- **แผน**: สถานะ (ไอเดีย → วางแผน → กำลังทำ → สำเร็จ) และ milestone พร้อมแถบความคืบหน้า
- **บันทึก**: แชร์กับแฟนหรือตั้งเป็นส่วนตัว ปักหมุดและค้นหาได้
- **PWA**: มี manifest, ไอคอน และ service worker แบบ network-first พร้อมหน้า offline
- **MCP**: มี 16 tools ดูรายการเต็มด้านล่าง

## เริ่มใช้งานบนเครื่อง

```bash
npm install
npm run cf-typegen   # สร้าง type ของ bindings (.cloudflare/types)
npm run dev          # http://localhost:5173
```

ไม่ต้องรัน migration เอง ระบบจะสร้างตารางให้อัตโนมัติตอน request แรก

ถ้าจะทดสอบใน runtime ของ Workers จริง (รวม `/mcp` และ OAuth) ให้ใช้คำสั่งนี้แทน:

```bash
npm run preview      # build แล้วรันด้วย workerd → http://localhost:4173
```

## Deploy ขึ้น Cloudflare

```bash
npx cf auth login    # ล็อกอิน Cloudflare (ครั้งแรกครั้งเดียว)
npm run deploy       # build + deploy; D1 และ KV ถูกสร้างให้อัตโนมัติจาก cloudflare.config.ts
```

- ถ้าจะใช้โดเมนของตัวเอง ให้ตั้งค่าที่ Workers → Settings → Domains & Routes
- เปลี่ยนเขตเวลาที่ใช้ตัดวันได้ที่ `APP_TIMEZONE` ใน `cloudflare.config.ts` (ค่าเริ่มต้นคือ `Asia/Bangkok`)

## เชื่อมกับ Claude (MCP)

URL ของ MCP คือ `https://<โดเมนของคุณ>/mcp` (ดู URL จริงได้ที่หน้า **ตั้งค่า** ในแอป)

- **Claude (เว็บ / เดสก์ท็อป)**: เมนูซ้าย **Plugins** → **Add** → **Add custom connector** → ตั้งชื่อ `Duo` วาง URL → เลือก "Use Claude's published identity" → Add → Connect → ล็อกอินแล้วกด "อนุญาต" (เชื่อมแล้วใช้บนแอปมือถือได้ด้วย)
- **Claude Code**: `claude mcp add --transport http duo https://<โดเมน>/mcp`

แต่ละคนเชื่อมด้วยบัญชีของตัวเอง สิ่งที่ Claude เห็นจะเหมือนกับที่ผู้ใช้คนนั้นเห็นบนเว็บทุกอย่าง

| Tool | ทำอะไร |
|---|---|
| `get_summary` | สรุปวันนี้ (เช็กอิน, นัด, งานค้าง, แผน, บันทึก) |
| `list_events` / `create_event` / `delete_event` | ปฏิทิน |
| `get_lists` / `get_list` / `add_list_item` / `complete_list_item` | รายการ (ระบุรายการด้วยชื่อได้ เช่น "ของที่ต้องซื้อ") |
| `submit_checkin` / `get_checkins` | เช็กอิน |
| `list_plans` / `create_plan` / `complete_milestone` | แผน |
| `add_note` / `search_notes` / `get_note` | บันทึก |

ตัวอย่างคำสั่ง: *"เพิ่มดอกไม้ในของที่ต้องซื้อ ให้แฟนเป็นคนซื้อ"*, *"สรุปสัปดาห์นี้ของเราหน่อย"*, *"จดบันทึกว่าวันนี้ไปกินชาบูกันมา"*

## โครงสร้างโปรเจกต์

```
worker.ts                 Worker entry: OAuthProvider → /mcp | /authorize | vinext
cloudflare.config.ts      bindings: D1 (DB), KV (OAUTH_KV), APP_TIMEZONE
lib/core/index.ts         ★ business logic + กฎสิทธิ์ (ใช้ร่วมกันทั้งเว็บและ MCP)
lib/db/schema.ts          Drizzle schema
lib/db/migrate.ts         auto-migration (ตาราง d1_migrations ใช้รูปแบบเดียวกับ CLI)
lib/auth.ts               password hashing, session
lib/mcp/server.ts         MCP tools
lib/mcp/authorize.ts      หน้ายินยอม OAuth
app/actions.ts            server actions ของหน้าเว็บ
app/(app)/*               หน้า dashboard, calendar, lists, checkin, plans, notes, settings
components/ui/*           shadcn/ui components
migrations/*.sql          สร้างด้วย `npm run db:generate`
public/                   manifest, icons, sw.js, offline.html
tests/                    e2e (Python + Playwright) ทั้งเว็บและ MCP OAuth flow
```

**แก้ schema:** แก้ `lib/db/schema.ts` แล้วรัน `npm run db:generate` ตอน deploy ครั้งถัดไป migration จะถูก apply อัตโนมัติ

## ทดสอบ

```bash
npm run preview &                      # รันที่ :4173
pip install playwright && playwright install chromium
python tests/web_test.py               # สมัคร 2 บัญชี จับคู่ ใช้ทุกฟีเจอร์ ตรวจกฎความเป็นส่วนตัว
python tests/mcp_test.py               # DCR → authorize → token → เรียก MCP tools
```

## ข้อจำกัด / งานถัดไป

- **Google Calendar sync** ยังไม่ทำ (ตามแผน phase ถัดไป)
- **Push notification** (Web Push) และ **realtime** (Durable Objects) ยังไม่ทำ ตอนนี้ข้อมูลจะอัปเดตเมื่อโหลดหน้าใหม่
- vinext ยังเป็น beta ถ้าเจอปัญหาความเข้ากันได้ ให้ย้ายไปใช้ OpenNext adapter ได้ เพราะโค้ดแอปเป็น Next.js App Router มาตรฐาน
- แฮชรหัสผ่านด้วย PBKDF2 10,000 รอบ เพื่อไม่ให้เกินโควตา CPU 10 ms ของแพ็กเกจฟรี ถ้าย้ายไป Workers Paid ให้เพิ่ม `PBKDF2_ITERATIONS` ใน `lib/auth.ts` เป็น 100_000 (แฮชเดิมจะอัปเดตเองตอนล็อกอิน)
- ยังไม่มีระบบลืมรหัสผ่าน (ต้องต่อบริการส่งอีเมลก่อน)
