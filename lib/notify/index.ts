/**
 * ระบบแจ้งเตือน (ไม่ผูกกับช่องทาง)
 * - enqueue*: ใส่ข้อความลงคิว (เรียกจาก lib/core ตอนมีแอคชัน)
 * - runNotifications: cron ทุกนาที → สร้างแจ้งเตือนตามเวลา + ส่งคิวที่ถึงเวลา
 * วันหลังทำแอปจริง แค่เพิ่มช่องทางส่ง (APNs/FCM) ใน deliver() ส่วนอื่นใช้ร่วมกันได้
 */
import { and, eq, gt, gte, inArray, isNull, like, lt, lte, ne } from "drizzle-orm";
import type { DB } from "../db";
import { checkins, coupleMembers, couples, events, notificationLog, notificationOutbox, pushSubscriptions, users } from "../db/schema";
import { characterOf } from "../characters";
import { newId } from "../ids";
import { sendWebPush, type VapidKeys } from "../push/webpush";
import { DAY_REMINDER_TIME, HOUR_PRESETS, isRemindBefore, MAX_CUSTOM_DAYS, reminderFireAt, type RemindBefore } from "../reminders";
import { addDays, cachedDtf, DEFAULT_TZ, formatDateTh, formatTime, isoToLocalYmd, localToIso, todayIn } from "../time";
import { birthdaysOn } from "../core/birthday";

/* ───────── ประเภทและค่าตั้งต้น ───────── */

export const NOTIFY_KINDS = [
  { id: "partner_checkin", label: "อีกฝ่ายเช็กอิน" },
  { id: "assigned", label: "อีกฝ่ายฝากงานให้" },
  { id: "new_event", label: "อีกฝ่ายเพิ่มนัด" },
  { id: "checkin_reminder", label: "เตือนเช็กอินถ้ายังไม่ได้เช็กอิน" },
  { id: "event_reminder", label: "เตือนนัด (ล่วงหน้าตามที่ตั้ง และก่อน 1 ชั่วโมง)" },
  { id: "event_tomorrow", label: "สรุปนัดของพรุ่งนี้ตอน 20:00" },
  { id: "anniversary", label: "วันครบรอบ (ล่วงหน้า 7 วัน และวันจริง)" },
  { id: "birthday", label: "เตือนวันเกิด (1 วันก่อน 09:00)" },
  { id: "pet", label: "กอด / คิดถึง / ป้อนขนมจากอีกฝ่าย" },
] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number]["id"];
export type NotifyPrefs = Record<NotifyKind, boolean>;

export const REMINDER_TIMES = ["19:00", "20:00", "21:00", "22:00"] as const;
export const QUIET_START = "23:00";
export const QUIET_END = "07:00";
const BATCH_WINDOW_MS = 60_000; // รอ 1 นาทีเผื่ออีกฝ่ายทำหลายอย่างติดกัน → รวบเป็นข้อความเดียว

/** ประเภทที่ปิดไว้เป็นค่าเริ่มต้น (ต้องกดเปิดเอง) — ที่เหลือเปิดเป็นค่าเริ่มต้น */
const DEFAULT_OFF: ReadonlySet<NotifyKind> = new Set<NotifyKind>(["event_tomorrow"]);

/**
 * อ่าน prefs ที่เก็บไว้: คีย์ที่ไม่มี = ค่าเริ่มต้น (เปิด ยกเว้น DEFAULT_OFF)
 * ผู้ใช้เดิมที่เคยบันทึก prefs ไว้ก่อนมี event_tomorrow → ไม่มีคีย์นี้ → ปิด
 */
export function parsePrefs(json: string | null | undefined): NotifyPrefs {
  let raw: Record<string, unknown> = {};
  try {
    const v = JSON.parse(json || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) raw = v;
  } catch {}
  return Object.fromEntries(NOTIFY_KINDS.map((k) => [k.id, DEFAULT_OFF.has(k.id) ? raw[k.id] === true : raw[k.id] !== false])) as NotifyPrefs;
}

/* ───────── เวลา ───────── */

function localHM(tz: string, at = new Date()) {
  return cachedDtf(`hm|${tz}`, "en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
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

const PET_MSG = {
  hug: { title: "ส่งกอดมา 🤗", short: "ส่งกอด" },
  miss: { title: "คิดถึงเธอ 💗", short: "คิดถึง" },
  treat: { title: "ป้อนขนมให้น้องของเธอ 🍪", short: "ป้อนขนม" },
} as const;

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
    | { type: "event"; title: string; startAt: string; allDay: boolean }
    | { type: "pet"; action: "hug" | "miss" | "treat" },
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
  // ช่วงเงียบ: ไม่ส่งเลย (ไม่เลื่อนไป 07:00) — กอด/คิดถึงตอนดึกไม่ควรมาเด้งตอนเช้า
  if (e.type === "pet" && prefs.pet && !inQuiet(localHM(tz, new Date()))) {
    const msg = PET_MSG[e.action];
    const title = `${voice(me)} ${msg.title}`;
    // กันซ้ำ: ถ้ายังมีแจ้งเตือนแบบเดียวกันรอส่งอยู่ (ยังไม่ถึงเวลา/ยังไม่ส่ง) ไม่ใส่คิวเพิ่ม → กอดรัวๆ ในนาทีเดียวได้ 1 push
    const pending = await db
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.userId, partner.id), eq(notificationOutbox.kind, "pet"), eq(notificationOutbox.title, title), isNull(notificationOutbox.sentAt)))
      .limit(1)
      .get();
    if (!pending) {
      await enqueue(db, partner.id, { kind: "pet", title, body: "แตะเพื่อดูในห้องของน้อง", short: msg.short, url: "/room", icon, groupable: true }, when);
    }
  }
}

/* ───────── แจ้งเตือนตามเวลา (cron) ───────── */

/* ───────── เตือนล่วงหน้า (pure helpers) ───────── */

/** ส่งย้อนหลังได้ไม่เกินเท่านี้ (เผื่อ cron พลาดบางนาที แต่ไม่ให้นัดเก่าถล่มหลัง deploy) */
export const ADVANCE_CATCHUP_MS = 30 * 60_000;
/** ช่วงที่ต้องดึงนัดมาคำนวณ: dN สูงสุด 30 วัน (+1 วันเผื่อเวลาเริ่มนัดในวันนั้น) */
export const ADVANCE_LOOKAHEAD_MS = (MAX_CUSTOM_DAYS + 1) * 86_400_000;

/** แบบชั่วโมงเตือนได้ไกลสุด 12 ชม. ก่อนเริ่ม (+ช่วงส่งย้อนหลัง) */
export const ADVANCE_HOUR_LOOKAHEAD_MS = Math.max(...HOUR_PRESETS) * 3_600_000 + ADVANCE_CATCHUP_MS;

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/**
 * แบบวัน (dN) เตือนตอน DAY_REMINDER_TIME (09:00) เท่านั้น → ถึงเวลาได้แค่ช่วง 09:00–09:30 (รวมส่งย้อนหลัง)
 * นอกช่วงนี้ query แค่แบบชั่วโมง (h*) ที่เริ่มภายใน 12 ชม. 30 นาที ผลลัพธ์เท่าเดิมแต่ดึงแถวน้อยลงมาก
 */
export function inDayReminderWindow(localHm: string): boolean {
  const m = toMin(localHm);
  const start = toMin(DAY_REMINDER_TIME);
  return m >= start && m <= start + ADVANCE_CATCHUP_MS / 60_000;
}

/** ขอบเขตของ query เตือนล่วงหน้าในนาทีนี้: hourOnly = ดึงแค่ remind_before LIKE 'h%' · startAt ∈ (now, horizonIso] */
export function advanceQueryScope(now: Date, tz: string): { hourOnly: boolean; horizonIso: string } {
  const dayWindow = inDayReminderWindow(localHM(tz, now));
  return {
    hourOnly: !dayWindow,
    horizonIso: new Date(now.getTime() + (dayWindow ? ADVANCE_LOOKAHEAD_MS : ADVANCE_HOUR_LOOKAHEAD_MS)).toISOString(),
  };
}

/** คำนำหน้าหัวข้อเตือนล่วงหน้า: d1 → "พรุ่งนี้", dN → "อีก N วัน", hN → "อีก N ชม." */
export function advanceLabel(value: RemindBefore): string {
  if (value === "d1") return "พรุ่งนี้";
  const n = Number(value.slice(1));
  if (value.startsWith("d")) return `อีก ${n} วัน`;
  if (value.startsWith("h")) return `อีก ${n} ชม.`;
  return "";
}

/** เวลาเตือนล่วงหน้าของนัดในฐานข้อมูล (null = ไม่เตือน / ค่าผิด) */
export function advanceFireAt(e: { startAt: string; allDay: boolean; remindBefore: string }, tz: string): Date | null {
  if (!isRemindBefore(e.remindBefore) || e.remindBefore === "none") return null;
  return reminderFireAt(e.remindBefore, { date: isoToLocalYmd(e.startAt, tz), time: e.allDay ? null : localHM(tz, new Date(e.startAt)) }, tz);
}

/** ถึงเวลาเตือนแล้วและยังอยู่ในช่วงส่งย้อนหลัง: now − 30 นาที ≤ fireAt ≤ now (และนัดยังไม่เริ่ม) */
export function advanceDue(e: { startAt: string; allDay: boolean; remindBefore: string }, tz: string, now: Date): boolean {
  const nowMs = now.getTime();
  if (Date.parse(e.startAt) <= nowMs) return false;
  const at = advanceFireAt(e, tz);
  if (!at) return false;
  const t = at.getTime();
  return t <= nowMs && t >= nowMs - ADVANCE_CATCHUP_MS;
}

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

  // นัดที่อาจต้องเตือนล่วงหน้า: ดึงครั้งเดียวต่อคู่ (ทั้งสองคนใช้ร่วมกัน) แล้วคำนวณเวลาเตือนใน JS
  const advanceCache = new Map<string, Promise<(typeof events.$inferSelect)[]>>();
  // ช่วง 09:00–09:30: ดึงทั้งแบบวัน+ชั่วโมง ภายใน 31 วัน · นอกช่วง: แค่แบบชั่วโมง ภายใน 12 ชม. 30 นาที
  const { hourOnly, horizonIso } = advanceQueryScope(now, tz);
  // วันเกิดพรุ่งนี้ (เฉพาะที่แสดงอยู่): ดึงครั้งเดียวต่อคู่ในช่วง 09:00–09:30 เท่านั้น
  const birthdayCache = new Map<string, Promise<{ userId: string; name: string }[]>>();
  const birthdaysFor = (coupleId: string, ymd: string) => {
    let q = birthdayCache.get(coupleId);
    if (!q) {
      q = birthdaysOn(db, coupleId, ymd);
      birthdayCache.set(coupleId, q);
    }
    return q;
  };
  const advanceFor = (coupleId: string) => {
    let q = advanceCache.get(coupleId);
    if (!q) {
      q = db
        .select()
        .from(events)
        .where(
          and(
            eq(events.coupleId, coupleId),
            hourOnly ? like(events.remindBefore, "h%") : ne(events.remindBefore, "none"),
            gt(events.startAt, nowIso),
            lte(events.startAt, horizonIso),
          ),
        )
        .all()
        .then((rows) => rows.filter((e) => advanceDue(e, tz, now)));
      advanceCache.set(coupleId, q);
    }
    return q;
  };

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

    // 2) (ไม่บังคับ ค่าเริ่มต้นปิด) คืนก่อนวันนัด 20:00: สรุปนัดของพรุ่งนี้
    if (prefs.event_tomorrow && hm >= "20:00" && !inQuiet(hm)) {
      const tomorrow = addDays(today, 1);
      const list = await db
        .select()
        .from(events)
        .where(and(eq(events.coupleId, p.coupleId), gte(events.startAt, localToIso(tomorrow, "00:00", tz)), lt(events.startAt, localToIso(addDays(tomorrow, 1), "00:00", tz))))
        .orderBy(events.startAt)
        .all();
      if (list.length && (await once(db, p.id, "event_tomorrow", tomorrow))) {
        const text = list.map((e) => (e.allDay ? e.title : `${formatTime(e.startAt, tz)} ${e.title}`)).join(" · ");
        await enqueue(db, p.id, { kind: "event_tomorrow", title: "📅 พรุ่งนี้มีนัดนะ", body: text, url: `/calendar?d=${tomorrow}` }, nowIso);
      }
    }

    if (prefs.event_reminder) {
      // 3a) เตือนล่วงหน้าตามที่ตั้งต่อนัด (ส่งตามเวลาจริงแม้อยู่ในช่วงเงียบ: ผู้ใช้เลือกเวลาเอง)
      for (const e of await advanceFor(p.coupleId)) {
        if (await once(db, p.id, "event_adv", e.id)) {
          const ymd = isoToLocalYmd(e.startAt, tz);
          const day = formatDateTh(ymd, { weekday: "short", day: "numeric", month: "short" });
          const when = e.allDay ? `${day} · ทั้งวัน` : `${day} ${formatTime(e.startAt, tz)}`;
          await enqueue(
            db,
            p.id,
            { kind: "event_reminder", title: `🔔 ${advanceLabel(e.remindBefore as RemindBefore)}: ${e.title}`, body: `${when}${e.location ? ` · ${e.location}` : ""}`, url: `/calendar?d=${ymd}`, icon },
            nowIso,
          );
        }
      }
      // 3b) ก่อนนัด 1 ชั่วโมง (เฉพาะนัดที่มีเวลา · ไม่ติดช่วงเงียบ)
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

    // 5) วันเกิด: เตือนก่อน 1 วันตอน 09:00 (ไม่ปรับเวลาได้) ส่งให้ทั้งสองคนถ้าวันเกิดนั้นแสดงอยู่
    if (prefs.birthday && inDayReminderWindow(hm)) {
      const tomorrow = addDays(today, 1);
      for (const b of await birthdaysFor(p.coupleId, tomorrow)) {
        const self = b.userId === p.id;
        if (await once(db, p.id, "birthday", `${b.userId}:${tomorrow}`)) {
          await enqueue(
            db,
            p.id,
            {
              kind: "birthday",
              title: self ? "🎂 พรุ่งนี้วันเกิดเธอแล้วนะ" : `🎂 พรุ่งนี้วันเกิด ${b.name}`,
              body: self ? "ขอให้เป็นวันที่ดีที่สุด 💕" : "เตรียมเซอร์ไพรส์กันหน่อยไหม 🎁",
              url: `/calendar?d=${tomorrow}`,
              icon,
            },
            nowIso,
          );
        }
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

