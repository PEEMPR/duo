/**
 * ระบบแจ้งเตือน (ไม่ผูกกับช่องทาง)
 * - enqueue*: ใส่ข้อความลงคิว (เรียกจาก lib/core ตอนมีแอคชัน)
 * - runNotifications: cron ทุกนาที → สร้างแจ้งเตือนตามเวลา + ส่งคิวที่ถึงเวลา
 * วันหลังทำแอปจริง แค่เพิ่มช่องทางส่ง (APNs/FCM) ใน deliver() ส่วนอื่นใช้ร่วมกันได้
 */
import { and, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import type { DB } from "../db";
import { checkins, coupleMembers, couples, events, notificationLog, notificationOutbox, pushSubscriptions, users } from "../db/schema";
import { characterOf } from "../characters";
import { newId } from "../ids";
import { sendWebPush, type VapidKeys } from "../push/webpush";
import { addDays, DEFAULT_TZ, formatDateTh, formatTime, isoToLocalYmd, localToIso, todayIn } from "../time";

/* ───────── ประเภทและค่าตั้งต้น ───────── */

export const NOTIFY_KINDS = [
  { id: "partner_checkin", label: "อีกฝ่ายเช็กอิน" },
  { id: "assigned", label: "อีกฝ่ายฝากงานให้" },
  { id: "new_event", label: "อีกฝ่ายเพิ่มนัด" },
  { id: "checkin_reminder", label: "เตือนเช็กอินถ้ายังไม่ได้เช็กอิน" },
  { id: "event_reminder", label: "เตือนนัด (คืนก่อนวันนัด และก่อน 1 ชั่วโมง)" },
  { id: "anniversary", label: "วันครบรอบ (ล่วงหน้า 7 วัน และวันจริง)" },
] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number]["id"];
export type NotifyPrefs = Record<NotifyKind, boolean>;

export const REMINDER_TIMES = ["19:00", "20:00", "21:00", "22:00"] as const;
export const QUIET_START = "23:00";
export const QUIET_END = "07:00";
const BATCH_WINDOW_MS = 60_000; // รอ 1 นาทีเผื่ออีกฝ่ายทำหลายอย่างติดกัน → รวบเป็นข้อความเดียว

export function parsePrefs(json: string | null | undefined): NotifyPrefs {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(json || "{}");
  } catch {}
  return Object.fromEntries(NOTIFY_KINDS.map((k) => [k.id, raw[k.id] !== false])) as NotifyPrefs;
}

/* ───────── เวลา ───────── */

function localHM(tz: string, at = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

const inQuiet = (hm: string) => hm >= QUIET_START || hm < QUIET_END;

/** เวลาที่ส่งได้: ถ้าอยู่ในช่วงเงียบ เลื่อนไป 07:00 ของเช้าถัดไป */
export function deliverTime(tz: string, now = new Date(), delayMs = 0): string {
  const at = new Date(now.getTime() + delayMs);
  const hm = localHM(tz, at);
  if (!inQuiet(hm)) return at.toISOString();
  const today = todayIn(tz, at);
  const day = hm >= QUIET_START ? addDays(today, 1) : today;
  return localToIso(day, QUIET_END, tz);
}

/* ───────── ใส่คิว ───────── */

type Msg = { kind: NotifyKind | "test"; title: string; body: string; short?: string; url?: string; icon?: string | null; groupable?: boolean };

async function enqueue(db: DB, userId: string, m: Msg, deliverAfter: string) {
  await db.insert(notificationOutbox).values({
    id: newId(),
    userId,
    kind: m.kind,
    title: m.title,
    body: m.body,
    short: m.short ?? null,
    url: m.url ?? "/dashboard",
    icon: m.icon ?? null,
    groupable: !!m.groupable,
    deliverAfter,
  });
}

async function partnerOf(db: DB, actorId: string) {
  const mine = await db.select().from(coupleMembers).where(eq(coupleMembers.userId, actorId)).get();
  if (!mine) return null;
  const rows = await db
    .select({ id: users.id, name: users.name, character: users.character, prefs: users.notifyPrefs })
    .from(coupleMembers)
    .innerJoin(users, eq(users.id, coupleMembers.userId))
    .where(eq(coupleMembers.coupleId, mine.coupleId))
    .all();
  const me = rows.find((r) => r.id === actorId);
  const partner = rows.find((r) => r.id !== actorId);
  return me && partner ? { me, partner } : null;
}

const iconFor = (character: string | null) => (characterOf(character) ? `/characters/${character}.png` : "/icon-192.png");
const voice = (u: { name: string; character: string | null }) => `${characterOf(u.character)?.emoji ?? "💞"} ${u.name}`;

/**
 * แจ้งอีกฝ่ายเมื่อเราทำแอคชัน (เรียกจาก lib/core ทั้งจากเว็บและ MCP)
 * ไม่ใส่เนื้อหาเช็กอิน/ข้อความส่วนตัวลงแจ้งเตือน เพราะอาจโชว์บนหน้าล็อก
 */
export async function notifyPartner(
  db: DB,
  actorId: string,
  tz: string,
  e:
    | { type: "checkin"; date: string }
    | { type: "assigned"; assigneeId: string; text: string; listName: string }
    | { type: "event"; title: string; startAt: string; allDay: boolean },
) {
  const pair = await partnerOf(db, actorId);
  if (!pair) return;
  const { me, partner } = pair;
  const prefs = parsePrefs(partner.prefs);
  const when = deliverTime(tz, new Date(), BATCH_WINDOW_MS);
  const icon = iconFor(me.character);

  if (e.type === "checkin" && prefs.partner_checkin) {
    const partnerDone = await db
      .select({ id: checkins.id })
      .from(checkins)
      .where(and(eq(checkins.userId, partner.id), eq(checkins.date, e.date)))
      .get();
    await enqueue(
      db,
      partner.id,
      {
        kind: "partner_checkin",
        title: `${voice(me)} เช็กอินแล้วนะ 💌`,
        body: partnerDone ? "แตะเพื่อดูว่าวันนี้อยากได้อะไรจากเธอ" : "เข้ามาเช็กอินแล้วจะบอกว่าวันนี้อยากได้อะไร 🤫",
        short: "เช็กอินแล้ว",
        url: "/checkin",
        icon,
        groupable: true,
      },
      when,
    );
  }
  if (e.type === "assigned" && e.assigneeId === partner.id && prefs.assigned) {
    await enqueue(
      db,
      partner.id,
      { kind: "assigned", title: `${voice(me)} ฝากงานหน่อยน้า`, body: `“${e.text}” (${e.listName})`, short: `ฝาก “${e.text}”`, url: "/lists", icon, groupable: true },
      when,
    );
  }
  if (e.type === "event" && prefs.new_event) {
    const day = formatDateTh(isoToLocalYmd(e.startAt, tz), { weekday: "short", day: "numeric", month: "short" });
    const at = e.allDay ? day : `${day} ${formatTime(e.startAt, tz)}`;
    await enqueue(
      db,
      partner.id,
      { kind: "new_event", title: `${voice(me)} เพิ่มนัดใหม่ 📅`, body: `${e.title} · ${at}`, short: `นัด “${e.title}”`, url: "/calendar", icon, groupable: true },
      when,
    );
  }
}

/* ───────── แจ้งเตือนตามเวลา (cron) ───────── */

/** บันทึกว่าส่งแล้ว: คืน true ถ้าเพิ่งบันทึกครั้งแรก (ยังไม่เคยส่ง) */
async function once(db: DB, userId: string, kind: string, ref: string) {
  const r = await db.insert(notificationLog).values({ userId, kind, ref }).onConflictDoNothing().returning({ ref: notificationLog.ref });
  return r.length > 0;
}

export async function scheduleReminders(db: DB, tz: string, now = new Date()) {
  const today = todayIn(tz, now);
  const hm = localHM(tz, now);
  const nowIso = now.toISOString();

  const people = await db
    .select({
      id: users.id,
      prefs: users.notifyPrefs,
      reminderAt: users.checkinReminderTime,
      character: users.character,
      coupleId: coupleMembers.coupleId,
      anniversary: couples.anniversary,
    })
    .from(users)
    .innerJoin(coupleMembers, eq(coupleMembers.userId, users.id))
    .innerJoin(couples, eq(couples.id, coupleMembers.coupleId))
    .where(inArray(users.id, db.select({ id: pushSubscriptions.userId }).from(pushSubscriptions)))
    .all();
  if (!people.length) return;

  const checkedToday = new Set(
    (await db.select({ id: checkins.userId }).from(checkins).where(eq(checkins.date, today)).all()).map((r) => r.id),
  );

  for (const p of people) {
    const prefs = parsePrefs(p.prefs);
    const icon = iconFor(p.character);

    // 1) เตือนเช็กอิน (วันละครั้ง หลังเวลาที่ตั้ง ถ้ายังไม่เช็กอิน และไม่อยู่ในช่วงเงียบ)
    if (prefs.checkin_reminder && hm >= p.reminderAt && !inQuiet(hm) && !checkedToday.has(p.id) && (await once(db, p.id, "checkin_reminder", today))) {
      const c = characterOf(p.character);
      await enqueue(
        db,
        p.id,
        { kind: "checkin_reminder", title: `${c ? `${c.emoji} ${c.name}` : "💞 Duo"} รอเธอเช็กอินอยู่นะ`, body: "วันนี้เป็นยังไงบ้าง? ใช้เวลาแค่ 1 นาที", url: "/checkin", icon },
        nowIso,
      );
    }

    if (prefs.event_reminder) {
      // 2) คืนก่อนวันนัด 20:00: สรุปนัดของพรุ่งนี้
      if (hm >= "20:00" && !inQuiet(hm)) {
        const tomorrow = addDays(today, 1);
        const list = await db
          .select()
          .from(events)
          .where(and(eq(events.coupleId, p.coupleId), gte(events.startAt, localToIso(tomorrow, "00:00", tz)), lt(events.startAt, localToIso(addDays(tomorrow, 1), "00:00", tz))))
          .orderBy(events.startAt)
          .all();
        if (list.length && (await once(db, p.id, "event_tomorrow", tomorrow))) {
          const text = list.map((e) => (e.allDay ? e.title : `${formatTime(e.startAt, tz)} ${e.title}`)).join(" · ");
          await enqueue(db, p.id, { kind: "event_reminder", title: "📅 พรุ่งนี้มีนัดนะ", body: text, url: `/calendar?d=${tomorrow}` }, nowIso);
        }
      }
      // 3) ก่อนนัด 1 ชั่วโมง (เฉพาะนัดที่มีเวลา)
      const soon = await db
        .select()
        .from(events)
        .where(and(eq(events.coupleId, p.coupleId), eq(events.allDay, false), gte(events.startAt, nowIso), lte(events.startAt, new Date(now.getTime() + 60 * 60_000).toISOString())))
        .all();
      for (const e of soon) {
        if (await once(db, p.id, "event_1h", e.id)) {
          await enqueue(
            db,
            p.id,
            { kind: "event_reminder", title: `⏰ อีกไม่ถึง 1 ชั่วโมง: ${e.title}`, body: `${formatTime(e.startAt, tz)}${e.location ? ` · ${e.location}` : ""}`, url: `/calendar?d=${isoToLocalYmd(e.startAt, tz)}` },
            nowIso,
          );
        }
      }
    }

    // 4) วันครบรอบ: ล่วงหน้า 7 วัน และวันจริง (หลัง 08:00)
    if (prefs.anniversary && p.anniversary && hm >= "08:00" && !inQuiet(hm)) {
      const md = p.anniversary.slice(5);
      const years = (d: string) => Number(d.slice(0, 4)) - Number(p.anniversary!.slice(0, 4));
      if (today.slice(5) === md && years(today) > 0 && (await once(db, p.id, "anniversary_day", today))) {
        await enqueue(db, p.id, { kind: "anniversary", title: `💞 สุขสันต์วันครบรอบ ${years(today)} ปี`, body: "ขอบคุณที่อยู่ด้วยกันมาตลอดนะ", icon }, nowIso);
      }
      const in7 = addDays(today, 7);
      if (in7.slice(5) === md && years(in7) > 0 && (await once(db, p.id, "anniversary_7d", in7))) {
        await enqueue(db, p.id, { kind: "anniversary", title: `💝 อีก 7 วันครบรอบ ${years(in7)} ปี`, body: "วางแผนอะไรกันดี? เพิ่มเป็นแผนหรือนัดไว้ได้เลย", url: "/plans", icon }, nowIso);
      }
    }
  }
}

/* ───────── ส่ง ───────── */

export type PushEnv = { DB: D1Database; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string; APP_TIMEZONE?: string };

export function vapidFrom(env: PushEnv): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || "mailto:duo@example.com" };
}

type Payload = { title: string; body: string; url: string; icon: string; tag: string };

/** ส่งไปทุกเครื่องของผู้ใช้ ลบเครื่องที่ยกเลิกแล้ว คืนจำนวนเครื่องที่ส่งสำเร็จ */
export async function deliver(db: DB, vapid: VapidKeys, userId: string, payload: Payload): Promise<number> {
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).all();
  let ok = 0;
  for (const s of subs) {
    try {
      const r = await sendWebPush(s, payload, vapid, { ttl: 12 * 3600 });
      if (r.ok) {
        ok++;
        await db.update(pushSubscriptions).set({ lastSuccessAt: new Date().toISOString() }).where(eq(pushSubscriptions.id, s.id));
      } else if (r.gone) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      } else {
        console.warn("[push] failed", r.status, new URL(s.endpoint).host);
      }
    } catch (e) {
      console.warn("[push] error", (e as Error).message);
    }
  }
  return ok;
}

export async function deliverDue(db: DB, vapid: VapidKeys, now = new Date()) {
  const due = await db
    .select()
    .from(notificationOutbox)
    .where(and(isNull(notificationOutbox.sentAt), lte(notificationOutbox.deliverAfter, now.toISOString())))
    .orderBy(notificationOutbox.createdAt)
    .limit(200)
    .all();
  if (!due.length) return 0;

  const byUser = new Map<string, typeof due>();
  for (const m of due) byUser.set(m.userId, [...(byUser.get(m.userId) ?? []), m]);

  for (const [userId, msgs] of byUser) {
    const group = msgs.filter((m) => m.groupable);
    const single = msgs.filter((m) => !m.groupable);
    const payloads: Payload[] = single.map((m) => ({ title: m.title, body: m.body, url: m.url, icon: m.icon ?? "/icon-192.png", tag: `${m.kind}-${m.id}` }));
    if (group.length === 1) {
      const m = group[0];
      payloads.push({ title: m.title, body: m.body, url: m.url, icon: m.icon ?? "/icon-192.png", tag: "partner" });
    } else if (group.length > 1) {
      // รวบหลายเรื่องจากอีกฝ่ายเป็นแจ้งเตือนเดียว: ใช้ชื่อ/อีโมจิจากหัวข้อแรก
      const who = group[0].title.split(" ").slice(0, 2).join(" ");
      payloads.push({ title: `${who} อัปเดต ${group.length} เรื่อง`, body: group.map((m) => m.short ?? m.body).join(" · "), url: "/dashboard", icon: group[0].icon ?? "/icon-192.png", tag: "partner" });
    }
    for (const p of payloads) await deliver(db, vapid, userId, p);
    await db
      .update(notificationOutbox)
      .set({ sentAt: now.toISOString() })
      .where(inArray(notificationOutbox.id, msgs.map((m) => m.id)));
  }
  // เก็บกวาด: ลบรายการที่ส่งแล้วเกิน 30 วัน
  await db.delete(notificationOutbox).where(lt(notificationOutbox.sentAt, new Date(now.getTime() - 30 * 86_400_000).toISOString()));
  return due.length;
}

/** เรียกจาก scheduled() ทุกนาที */
export async function runNotifications(db: DB, env: PushEnv, now = new Date()) {
  const vapid = vapidFrom(env);
  if (!vapid) return; // ยังไม่ได้ตั้งค่า VAPID → ข้ามทั้งหมด
  const tz = env.APP_TIMEZONE || DEFAULT_TZ;
  await scheduleReminders(db, tz, now);
  await deliverDue(db, vapid, now);
}

