/**
 * ห้องของน้อง — สัตว์เลี้ยงของเราอยู่ในห้องเสมอ ส่วนน้องของอีกฝ่ายจะเข้ามาเมื่ออีกฝ่ายทำกิจกรรมวันนี้แล้ว
 * แล้วเล่ากิจกรรมของอีกฝ่ายให้ฟัง (activity_feed)
 *
 * กฎความเป็นส่วนตัว (บังคับที่ server):
 * - เช็กอินของอีกฝ่าย: ถ้าเรายังไม่เช็กอินวันนี้ → teaser ไม่มีเนื้อหา/อารมณ์ (รวมถึงอารมณ์ของน้องอีกฝ่ายด้วย)
 * - ข้อความของ event/assign/note/milestone สร้างตอนอ่านจากข้อมูลปัจจุบัน (ไม่เก็บใน activity_feed)
 *   ของที่ถูกลบ/แก้/เปลี่ยนเป็นส่วนตัว/milestone ที่ยกเลิก/งานที่ไม่ได้ฝากเราแล้ว → ไม่เล่า
 *
 * CPU: getRoomState ใช้ db.batch รอบเดียว (query ทั้งหมดใช้ index)
 */
import { and, asc, desc, eq, gte, inArray, lt, or, sql, type AnyColumn } from "drizzle-orm";
import type { DB } from "../db";
import { activityFeed, checkins, coupleMembers, couples, events, listItems, milestones, notes, petSeen, users } from "../db/schema";
import { newId } from "../ids";
import { pokeRoom } from "../realtime/poke";
import { addDays, cachedDtf, dayRangeIso, DEFAULT_TZ, formatDateTh, formatTime, isoToLocalYmd, todayIn } from "../time";
import type { Actor } from "./index";

/* ───────────── Types ───────────── */

export const ROOM_IDS = ["bedroom", "cafe", "balcony", "garden", "stargaze"] as const;
export type RoomId = (typeof ROOM_IDS)[number];
export const isRoomId = (v: unknown): v is RoomId => (ROOM_IDS as readonly unknown[]).includes(v);

const THEME_ROOM: Record<string, RoomId> = { rose: "bedroom", cocoa: "cafe", sunset: "balcony", lavender: "garden", midnight: "stargaze" };
export function defaultRoomForTheme(theme: string | null | undefined): RoomId {
  return (theme && THEME_ROOM[theme]) || "bedroom";
}

export const ACTIVITY_KINDS = ["checkin", "note", "assign", "event", "milestone", "hug", "miss", "treat"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
const isActivityKind = (v: unknown): v is ActivityKind => (ACTIVITY_KINDS as readonly unknown[]).includes(v);

export type PetMood = "happy" | "love" | "sleepy" | "sad" | "excited";
export type PetPose = "stand" | "sleep" | "curl";
export type RoomPet = { userId: string; name: string; character: string | null; mood: PetMood; pose: PetPose };
/**
 * id = id ของกิจกรรม (teaser เช็กอินใช้ `${id}:t` — พอผู้ดูเช็กอินแล้วข้อความจริงเป็น item ใหม่ที่ยังไม่ seen)
 * target = (เฉพาะ treat) น้องตัวไหนได้ขนม มองจากฝั่งผู้ดู: "me" = น้องของเรา, "partner" = น้องของอีกฝ่าย
 */
export type RoomQueueItem = { id: string; kind: ActivityKind; text: string; teaser: boolean; href: string | null; at: string; seen: boolean; target?: "me" | "partner" };
export type RoomState = {
  today: string;
  room: RoomId;
  me: RoomPet & { treats: number; rest: boolean };
  partner: (RoomPet & { present: boolean }) | null;
  queue: RoomQueueItem[];
  memory: { id: string; text: string; href: string | null } | null;
};

/* ───────────── ค่าคงที่ ───────────── */

export const HUG_COOLDOWN_SEC = 60;
export const BOOST_WINDOW_MS = 30 * 60_000;
export const TREATS_PER_DAY = 5;
export const TREATS_CAP = 20;
export const SAD_AFTER_DAYS = 3;
export const CURL_AFTER_DAYS = 7;
export const CHECKIN_TEASER = "เช็กอินแล้วนะ เธอเช็กอินก่อนแล้วจะบอก 🤫";
const MOOD_EMOJI = ["😢", "😕", "😐", "🙂", "🥰"] as const; // ตรงกับ components/mood.tsx (1 แย่ → 5 ดีมาก)

const tzOf = (a: Actor) => a.tz || DEFAULT_TZ;

/* ───────────── Pure helpers (ทดสอบได้โดยไม่ต้องมี DB) ───────────── */

/** ตัดข้อความให้สั้น รวมช่องว่าง/ขึ้นบรรทัดเป็นช่องว่างเดียว */
export function clip(s: string | null | undefined, max: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export const activityText = {
  event: (title: string, startAt: string, allDay: boolean, tz: string = DEFAULT_TZ) => {
    const day = formatDateTh(isoToLocalYmd(startAt, tz), { day: "numeric", month: "short" });
    return `ชวนไป '${clip(title, 60)}' ${day}${allDay ? "" : ` ${formatTime(startAt, tz)}`}`;
  },
  assign: (text: string) => `ฝาก '${clip(text, 80)}' หน่อยนะ`,
  note: (title: string, body: string) => {
    const b = clip(body, 60);
    return `เขียนบันทึก '${clip(title, 60)}'${b ? `: ${b}` : ""}`;
  },
  milestone: (title: string) => `'${clip(title, 80)}' เสร็จแล้ว! 🎉`,
  hug: () => "ส่งกอดมาให้ 🤗",
  miss: () => "คิดถึงนะ 💗",
  treat: (target: "me" | "partner") => (target === "partner" ? "ป้อนขนมให้น้อง 🍪" : "ป้อนขนมให้น้องของตัวเอง 🍪"),
} as const;

/** ข้อความเช็กอินของอีกฝ่าย — สร้างตอนอ่านเท่านั้น · ผู้ดูยังไม่เช็กอิน = teaser */
export function checkinText(
  row: { mood: number; need: string | null; gratitude: string | null } | null,
  viewerCheckedIn: boolean,
): { text: string; teaser: boolean } {
  if (!viewerCheckedIn || !row) return { text: CHECKIN_TEASER, teaser: true };
  const emoji = MOOD_EMOJI[Math.min(5, Math.max(1, row.mood)) - 1];
  const parts: string[] = [];
  if (row.need?.trim()) parts.push(`วันนี้อยากได้: ${clip(row.need, 80)}`);
  if (row.gratitude?.trim()) parts.push(`ขอบคุณเรื่อง: ${clip(row.gratitude, 80)}`);
  return { text: parts.length ? `${emoji} ${parts.join(" · ")}` : `${emoji} วันนี้เช็กอินแล้วนะ`, teaser: false };
}

/** อารมณ์จากเช็กอิน 1-5 (ดู MOOD_EMOJI: 5 = 🥰 จึงเป็น love, 4 = 🙂 สดใส → excited) */
export function moodFromCheckin(mood: number): PetMood {
  return (["sad", "sleepy", "happy", "excited", "love"] as const)[Math.min(5, Math.max(1, Math.round(mood))) - 1];
}

export function isNightHour(hour: number): boolean {
  return hour >= 23 || hour < 7;
}

export function localHour(tz: string = DEFAULT_TZ, at: Date = new Date()): number {
  const h = Number(cachedDtf(`petHour|${tz}`, "en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(at));
  return h === 24 ? 0 : h;
}

/**
 * ลำดับความสำคัญ: กลางคืนหลับ → ไม่เช็กอิน ≥7 วันขดตัว → ≥3 วันเศร้า (ปิดได้ด้วยโหมดพัก)
 * → อารมณ์จากเช็กอินวันนี้ (ถ้าเพิ่งได้กอด/ขนม ยก sad/sleepy เป็น happy) → happy · ไม่มีป่วย/ตาย
 */
export function computePet(input: {
  night: boolean;
  rest: boolean;
  daysSinceCheckin: number;
  todayMood: number | null; // null = ไม่มี หรือผู้ดูไม่มีสิทธิ์เห็น
  boosted: boolean;
}): { mood: PetMood; pose: PetPose } {
  if (input.night) return { mood: "sleepy", pose: "sleep" };
  if (!input.rest && input.daysSinceCheckin >= CURL_AFTER_DAYS) return { mood: "sad", pose: "curl" };
  if (!input.rest && input.daysSinceCheckin >= SAD_AFTER_DAYS) return { mood: "sad", pose: "stand" };
  if (input.todayMood != null) {
    const m = moodFromCheckin(input.todayMood);
    // เพิ่งได้กอด/ขนม → ยกอารมณ์ที่ต่ำกว่า happy (sad/sleepy) ขึ้นเป็น happy · อารมณ์ที่ดีกว่าอยู่แล้วคงไว้
    return { mood: input.boosted && (m === "sad" || m === "sleepy") ? "happy" : m, pose: "stand" };
  }
  return { mood: "happy", pose: "stand" };
}

/** วินาทีที่ต้องรอก่อนกดได้อีก (0 = กดได้) */
export function retryAfterSec(lastAtIso: string | null | undefined, nowMs: number = Date.now(), cooldownSec = HUG_COOLDOWN_SEC): number {
  if (!lastAtIso) return 0;
  const elapsed = nowMs - Date.parse(lastAtIso);
  if (!Number.isFinite(elapsed)) return 0;
  const left = cooldownSec * 1000 - elapsed;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** วันเดียวกันของปีที่แล้ว (29 ก.พ. → 28 ก.พ.) */
export function oneYearAgo(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate(); // วันสุดท้ายของเดือนนั้นในปีที่แล้ว
  return `${String(y - 1).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** จำนวนวันตั้งแต่เช็กอินล่าสุด · ไม่เคยเช็กอิน = นับจากวันสมัคร */
export function daysSince(today: string, lastCheckin: string | null, createdDay: string | null): number {
  const from = lastCheckin ?? createdDay ?? today;
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
}

export function activityHref(kind: ActivityKind, refId: string | null, listId?: string | null): string | null {
  switch (kind) {
    case "checkin":
      return "/checkin";
    case "note":
      return refId ? `/notes/${refId}` : "/notes";
    case "assign":
      return listId ? `/lists/${listId}` : "/lists";
    case "event":
      return "/calendar";
    case "milestone":
      return "/plans";
    default:
      return null;
  }
}

/** kind ที่เก็บ text ไว้ตอนเขียนได้ (ไม่มีข้อมูลที่แก้/ลบทีหลังได้) — ที่เหลือสร้างตอนอ่าน */
const STORED_TEXT_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>(["hug", "miss", "treat"]);

/** มุมมองผู้ดู: กิจกรรมใน queue เป็นของอีกฝ่ายเสมอ → target ที่อีกฝ่ายบันทึก ("me" = น้องตัวเขาเอง) กลับด้าน */
export function treatTargetForViewer(storedTarget: unknown): "me" | "partner" {
  return storedTarget === "partner" ? "me" : "partner";
}

/** ids ที่ client ส่งมา mark seen ได้: id กิจกรรมวันนี้ของคู่นี้ (หรือ `${id}:t`) และ memory:<วันนี้> */
export function seenBaseId(id: string): string {
  return id.endsWith(":t") ? id.slice(0, -2) : id;
}

function parseMeta(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

async function safePoke(coupleId: string, type: "activity" | "room") {
  try {
    await pokeRoom(coupleId, type);
  } catch (err) {
    console.warn("[pet] poke skipped:", (err as Error).message);
  }
}

/* ───────────── Write ───────────── */

export async function recordActivity(
  db: DB,
  a: Actor,
  kind: ActivityKind,
  data: { refId?: string | null; text?: string | null; meta?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await db.insert(activityFeed).values({
      id: newId(),
      coupleId: a.coupleId,
      userId: a.userId,
      kind,
      refId: data.refId ?? null,
      text: STORED_TEXT_KINDS.has(kind) && data.text ? data.text.slice(0, 300) : null,
      meta: data.meta ? JSON.stringify(data.meta) : null,
      day: todayIn(tzOf(a)),
    });
  } catch (err) {
    console.warn("[pet] recordActivity skipped:", (err as Error).message);
    return;
  }
  await safePoke(a.coupleId, "activity");
}

/** เหมือน recordActivity แต่ข้ามถ้าวันนี้ผู้ใช้คนนี้มีกิจกรรม kind+refId เดียวกันแล้ว (กันกดสลับเสร็จ/ไม่เสร็จแล้วเล่าซ้ำ) */
export async function recordActivityOnce(
  db: DB,
  a: Actor,
  kind: ActivityKind,
  data: { refId: string; text?: string | null; meta?: Record<string, unknown> },
): Promise<void> {
  try {
    const dup = await db
      .select({ id: activityFeed.id })
      .from(activityFeed)
      .where(
        and(
          eq(activityFeed.coupleId, a.coupleId),
          eq(activityFeed.day, todayIn(tzOf(a))),
          eq(activityFeed.userId, a.userId),
          eq(activityFeed.kind, kind),
          eq(activityFeed.refId, data.refId),
        ),
      )
      .get();
    if (dup) return;
  } catch (err) {
    console.warn("[pet] recordActivityOnce check skipped:", (err as Error).message);
    return;
  }
  await recordActivity(db, a, kind, data);
}

/** รับเฉพาะ id ของกิจกรรมวันนี้ในคู่นี้ (รวม `${id}:t`) และ memory:<วันนี้> · อย่างอื่นทิ้ง */
export async function markSeen(db: DB, a: Actor, ids: string[]): Promise<void> {
  const today = todayIn(tzOf(a));
  const memoryId = `memory:${today}`;
  const clean = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64))].slice(0, 50);
  if (!clean.length) return;
  const bases = [...new Set(clean.filter((id) => id !== memoryId).map(seenBaseId))];
  const valid = new Set<string>();
  if (bases.length) {
    const rows = await db
      .select({ id: activityFeed.id })
      .from(activityFeed)
      .where(and(eq(activityFeed.coupleId, a.coupleId), eq(activityFeed.day, today), inArray(activityFeed.id, bases)))
      .all();
    for (const r of rows) valid.add(r.id);
  }
  const accepted = clean.filter((id) => id === memoryId || valid.has(seenBaseId(id)));
  if (!accepted.length) return;
  await db
    .insert(petSeen)
    .values(accepted.map((itemId) => ({ userId: a.userId, itemId })))
    .onConflictDoNothing();
}

export async function setRoom(db: DB, a: Actor, room: RoomId): Promise<void> {
  if (!isRoomId(room)) throw new Error("ไม่มีห้องนี้");
  await db.update(couples).set({ room }).where(eq(couples.id, a.coupleId));
  await safePoke(a.coupleId, "room");
}

/** กอด/คิดถึง: INSERT แบบมีเงื่อนไขคำสั่งเดียว (ไม่มี race) · ไม่มีแถวใหม่ = ยังไม่ครบ 60 วิ */
async function sendRateLimited(db: DB, a: Actor, kind: "hug" | "miss"): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const now = Date.now();
  const today = todayIn(tzOf(a), new Date(now));
  const since = addDays(today, -1); // ใช้ index (couple_id, day) · เผื่อกดข้ามเที่ยงคืน
  const cutoff = new Date(now - HUG_COOLDOWN_SEC * 1000).toISOString();
  const inserted = await db.all<{ id: string }>(sql`
    insert into ${activityFeed} (id, couple_id, user_id, kind, ref_id, text, meta, day)
    select ${newId()}, ${a.coupleId}, ${a.userId}, ${kind}, null, ${activityText[kind]()}, null, ${today}
    where not exists (
      select 1 from ${activityFeed}
      where couple_id = ${a.coupleId} and day >= ${since} and user_id = ${a.userId} and kind = ${kind} and created_at > ${cutoff}
    )
    returning id`);
  if (inserted.length) {
    await safePoke(a.coupleId, "activity");
    return { ok: true };
  }
  const last = await db
    .select({ createdAt: activityFeed.createdAt })
    .from(activityFeed)
    .where(and(eq(activityFeed.coupleId, a.coupleId), gte(activityFeed.day, since), eq(activityFeed.userId, a.userId), eq(activityFeed.kind, kind)))
    .orderBy(desc(activityFeed.createdAt))
    .limit(1)
    .get();
  return { ok: false, retryAfter: Math.max(1, retryAfterSec(last?.createdAt, now)) };
}

export const sendHug = (db: DB, a: Actor) => sendRateLimited(db, a, "hug");
export const sendMiss = (db: DB, a: Actor) => sendRateLimited(db, a, "miss");

export async function feedTreat(db: DB, a: Actor, target: "me" | "partner"): Promise<{ ok: boolean; treats: number }> {
  if (target !== "me" && target !== "partner") throw new Error("ป้อนขนมได้แค่น้องของเราหรือของอีกฝ่าย");
  if (target === "partner") {
    const partner = await db
      .select({ userId: coupleMembers.userId })
      .from(coupleMembers)
      .where(and(eq(coupleMembers.coupleId, a.coupleId), sql`${coupleMembers.userId} <> ${a.userId}`))
      .get();
    if (!partner) return { ok: false, treats: await treatsOf(db, a.userId) };
  }
  const res = await db
    .update(users)
    .set({ treats: sql`${users.treats} - 1` })
    .where(and(eq(users.id, a.userId), sql`${users.treats} > 0`))
    .returning({ treats: users.treats });
  if (!res.length) return { ok: false, treats: await treatsOf(db, a.userId) };
  await recordActivity(db, a, "treat", { text: activityText.treat(target), meta: { target } });
  return { ok: true, treats: res[0].treats };
}

async function treatsOf(db: DB, userId: string): Promise<number> {
  const r = await db.select({ treats: users.treats }).from(users).where(eq(users.id, userId)).get();
  return r?.treats ?? 0;
}

/**
 * +1 ขนม (วันละไม่เกิน 5, สะสมไม่เกิน 20) · atomic ใน UPDATE เดียว
 * (SQLite ใช้ค่าเดิมของทุกคอลัมน์ในนิพจน์ SET)
 */
export async function earnTreat(db: DB, a: Actor): Promise<void> {
  const today = todayIn(tzOf(a));
  try {
    await db
      .update(users)
      .set({
        treats: sql`min(${users.treats} + 1, ${TREATS_CAP})`,
        treatsToday: sql`case when ${users.treatsDay} = ${today} then ${users.treatsToday} + 1 else 1 end`,
        treatsDay: today,
      })
      .where(
        and(
          eq(users.id, a.userId),
          sql`${users.treats} < ${TREATS_CAP}`,
          sql`(${users.treatsDay} is null or ${users.treatsDay} <> ${today} or ${users.treatsToday} < ${TREATS_PER_DAY})`,
        ),
      );
  } catch (err) {
    console.warn("[pet] earnTreat skipped:", (err as Error).message);
  }
}

/**
 * ขนมจากการทำรายการเสร็จ: ได้ครั้งเดียวต่อรายการต่อคน ตลอดไป
 * กุญแจกันซ้ำ = แถว pet_seen (user_id, "treat:<itemId>") — markSeen ไม่รับ id รูปแบบนี้ จึงปลอมจาก client ไม่ได้
 * เรียกหลัง UPDATE แบบมีเงื่อนไข (done = 0 → 1) สำเร็จเท่านั้น
 */
export async function earnTreatForItem(db: DB, a: Actor, itemId: string): Promise<void> {
  try {
    const first = await db
      .insert(petSeen)
      .values({ userId: a.userId, itemId: `treat:${itemId}` })
      .onConflictDoNothing()
      .returning({ itemId: petSeen.itemId });
    if (first.length) await earnTreat(db, a);
  } catch (err) {
    console.warn("[pet] earnTreatForItem skipped:", (err as Error).message);
  }
}

export async function setPetRest(db: DB, userId: string, on: boolean): Promise<void> {
  await db.update(users).set({ petRest: !!on }).where(eq(users.id, userId));
}

/* ───────────── Read ───────────── */

export async function getRoomState(db: DB, a: Actor): Promise<RoomState> {
  const tz = tzOf(a);
  const now = new Date();
  const today = todayIn(tz, now);
  const boostCutoff = new Date(now.getTime() - BOOST_WINDOW_MS).toISOString();
  const lastYear = oneYearAgo(today);
  const lyRange = dayRangeIso(lastYear, tz);
  const memoryId = `memory:${today}`;
  const sameCouple = (col: AnyColumn) => eq(col, activityFeed.coupleId);

  const [members, feed, cis, memEvent, memNote, memMilestone, memSeen] = await db.batch([
    db
      .select({
        userId: users.id,
        name: users.name,
        character: users.character,
        treats: users.treats,
        rest: users.petRest,
        createdAt: users.createdAt,
        room: couples.room,
        theme: couples.theme,
      })
      .from(coupleMembers)
      .innerJoin(users, eq(users.id, coupleMembers.userId))
      .innerJoin(couples, eq(couples.id, coupleMembers.coupleId))
      .where(eq(coupleMembers.coupleId, a.coupleId)),
    // กิจกรรมวันนี้ (+ 30 นาทีล่าสุดเผื่อข้ามเที่ยงคืน สำหรับ boost)
    // join ข้อมูลปัจจุบันด้วย PK (ข้อความสร้างตอนอ่าน) + สถานะ seen ของผู้ดู (ปกติ / teaser)
    db
      .select({
        id: activityFeed.id,
        userId: activityFeed.userId,
        kind: activityFeed.kind,
        refId: activityFeed.refId,
        text: activityFeed.text,
        meta: activityFeed.meta,
        day: activityFeed.day,
        createdAt: activityFeed.createdAt,
        seen: sql<number>`exists(select 1 from ${petSeen} where ${petSeen.userId} = ${a.userId} and ${petSeen.itemId} = ${activityFeed.id})`.as("seen"),
        seenTeaser: sql<number>`exists(select 1 from ${petSeen} where ${petSeen.userId} = ${a.userId} and ${petSeen.itemId} = ${activityFeed.id} || ':t')`.as("seen_teaser"),
        // ตั้งชื่อคอลัมน์ไม่ให้ซ้ำ (title/text ซ้ำหลายตาราง) — ผล batch ของ D1 เป็น object ชื่อซ้ำจะทับกัน
        evTitle: sql<string | null>`${events.title}`.as("ev_title"),
        evStart: sql<string | null>`${events.startAt}`.as("ev_start"),
        evAllDay: sql<number | null>`${events.allDay}`.as("ev_all_day"),
        liText: sql<string | null>`${listItems.text}`.as("li_text"),
        liAssignee: sql<string | null>`${listItems.assigneeId}`.as("li_assignee"),
        liList: sql<string | null>`${listItems.listId}`.as("li_list"),
        msTitle: sql<string | null>`${milestones.title}`.as("ms_title"),
        msDone: sql<number | null>`${milestones.done}`.as("ms_done"),
        noteTitle: sql<string | null>`${notes.title}`.as("note_title"),
        noteBody: sql<string | null>`substr(${notes.body}, 1, 200)`.as("note_body"),
        noteVisibility: sql<string | null>`${notes.visibility}`.as("note_visibility"),
      })
      .from(activityFeed)
      .leftJoin(events, and(eq(activityFeed.kind, "event"), eq(events.id, activityFeed.refId), sameCouple(events.coupleId)))
      .leftJoin(listItems, and(eq(activityFeed.kind, "assign"), eq(listItems.id, activityFeed.refId), sameCouple(listItems.coupleId)))
      .leftJoin(milestones, and(eq(activityFeed.kind, "milestone"), eq(milestones.id, activityFeed.refId), sameCouple(milestones.coupleId)))
      .leftJoin(notes, and(eq(activityFeed.kind, "note"), eq(notes.id, activityFeed.refId), sameCouple(notes.coupleId)))
      .where(and(eq(activityFeed.coupleId, a.coupleId), gte(activityFeed.day, addDays(today, -1)), or(eq(activityFeed.day, today), gte(activityFeed.createdAt, boostCutoff))))
      .orderBy(asc(activityFeed.createdAt)),
    // เช็กอิน 8 วันล่าสุดของทั้งคู่ (พอสำหรับเกณฑ์ 3/7 วัน + เช็กอินวันนี้)
    db
      .select({ userId: checkins.userId, date: checkins.date, mood: checkins.mood, need: checkins.need, gratitude: checkins.gratitude })
      .from(checkins)
      .where(and(eq(checkins.coupleId, a.coupleId), gte(checkins.date, addDays(today, -CURL_AFTER_DAYS))))
      .orderBy(desc(checkins.date)),
    // ปีที่แล้ววันนี้: นัดที่เริ่มวันนั้น / โน้ตที่แชร์ที่เขียนวันนั้น / milestone ที่สำเร็จวันนั้น
    db
      .select({ id: events.id, title: events.title })
      .from(events)
      .where(and(eq(events.coupleId, a.coupleId), gte(events.startAt, lyRange.start), lt(events.startAt, lyRange.end)))
      .orderBy(asc(events.startAt))
      .limit(1),
    db
      .select({ id: notes.id, title: notes.title })
      .from(notes)
      .where(and(eq(notes.coupleId, a.coupleId), eq(notes.visibility, "shared"), gte(notes.createdAt, lyRange.start), lt(notes.createdAt, lyRange.end)))
      .limit(1),
    db
      .select({ id: milestones.id, title: milestones.title })
      .from(activityFeed)
      .innerJoin(milestones, eq(milestones.id, activityFeed.refId))
      .where(and(eq(activityFeed.coupleId, a.coupleId), eq(activityFeed.day, lastYear), eq(activityFeed.kind, "milestone"), eq(milestones.done, true)))
      .limit(1),
    db.select({ itemId: petSeen.itemId }).from(petSeen).where(and(eq(petSeen.userId, a.userId), eq(petSeen.itemId, memoryId))).limit(1),
  ]);

  const meRow = members.find((m) => m.userId === a.userId);
  if (!meRow) throw new Error("ไม่พบสมาชิกในคู่นี้");
  const partnerRow = members.find((m) => m.userId !== a.userId) ?? null;
  const room: RoomId = isRoomId(meRow.room) ? meRow.room : defaultRoomForTheme(meRow.theme);
  const night = isNightHour(localHour(tz, now));

  const lastCheckin = (userId: string) => cis.find((c) => c.userId === userId)?.date ?? null; // เรียงใหม่→เก่าแล้ว
  const todayCi = (userId: string) => cis.find((c) => c.userId === userId && c.date === today) ?? null;
  const myCi = todayCi(a.userId);
  const viewerCheckedIn = !!myCi;

  // boost: ได้กอด (จากอีกฝ่าย) หรือมีคนป้อนขนมให้น้องตัวนี้ ใน 30 นาทีล่าสุด
  const boostedFor = (userId: string) =>
    feed.some((r) => {
      if (r.createdAt < boostCutoff) return false;
      if (r.kind === "hug") return r.userId !== userId;
      if (r.kind === "treat") {
        const target = parseMeta(r.meta)?.target;
        return r.userId === userId ? target === "me" : target === "partner";
      }
      return false;
    });

  const petOf = (row: NonNullable<typeof partnerRow>, mood: number | null): RoomPet => ({
    userId: row.userId,
    name: row.name,
    character: row.character,
    ...computePet({
      night,
      rest: row.rest,
      daysSinceCheckin: daysSince(today, lastCheckin(row.userId), row.createdAt ? isoToLocalYmd(row.createdAt, tz) : null),
      todayMood: mood,
      boosted: boostedFor(row.userId),
    }),
  });

  const me = { ...petOf(meRow, myCi?.mood ?? null), treats: meRow.treats, rest: meRow.rest };

  let partner: RoomState["partner"] = null;
  const queue: RoomQueueItem[] = [];
  if (partnerRow) {
    const pCi = todayCi(partnerRow.userId);
    for (const r of feed) {
      if (r.userId !== partnerRow.userId || r.day !== today || !isActivityKind(r.kind)) continue;
      let text: string;
      let teaser = false;
      let href = activityHref(r.kind, r.refId);
      let target: "me" | "partner" | undefined;
      switch (r.kind) {
        case "checkin":
          if (!pCi) continue; // เช็กอินถูกลบ
          ({ text, teaser } = checkinText(pCi, viewerCheckedIn));
          break;
        case "event":
          if (!r.evTitle || !r.evStart) continue; // นัดถูกลบ
          text = activityText.event(r.evTitle, r.evStart, !!r.evAllDay, tz);
          break;
        case "assign":
          if (r.liText == null || r.liAssignee !== a.userId) continue; // ถูกลบ / ไม่ได้ฝากเราแล้ว
          text = activityText.assign(r.liText);
          href = activityHref("assign", r.refId, r.liList);
          break;
        case "milestone":
          if (!r.msTitle || !r.msDone) continue; // ถูกลบ / ยกเลิกเสร็จ
          text = activityText.milestone(r.msTitle);
          break;
        case "note":
          if (r.noteTitle == null || r.noteVisibility !== "shared") continue; // ถูกลบ / ส่วนตัว
          text = activityText.note(r.noteTitle, r.noteBody ?? "");
          break;
        case "treat":
          target = treatTargetForViewer(parseMeta(r.meta)?.target);
          text = r.text || activityText.treat(target === "me" ? "partner" : "me");
          break;
        default: // hug / miss
          text = r.text || activityText[r.kind]();
      }
      queue.push({
        id: teaser ? `${r.id}:t` : r.id,
        kind: r.kind,
        text,
        teaser,
        href: teaser ? "/checkin" : href,
        at: r.createdAt,
        seen: !!(teaser ? r.seenTeaser : r.seen),
        ...(target ? { target } : {}),
      });
    }
    // อารมณ์จากเช็กอินของอีกฝ่ายเห็นได้เฉพาะเมื่อเราเช็กอินแล้ว
    partner = { ...petOf(partnerRow, viewerCheckedIn ? (pCi?.mood ?? null) : null), present: queue.length > 0 };
  }

  let memory: RoomState["memory"] = null;
  if (!memSeen.length) {
    const ev = memEvent[0];
    const nt = memNote[0];
    const ms = memMilestone[0];
    if (ev) memory = { id: memoryId, text: `ปีที่แล้ววันนี้เราไป '${clip(ev.title, 60)}' กันนะ`, href: "/calendar" };
    else if (nt) memory = { id: memoryId, text: `ปีที่แล้ววันนี้เราเขียนบันทึก '${clip(nt.title, 60)}' กันนะ`, href: `/notes/${nt.id}` };
    else if (ms) memory = { id: memoryId, text: `ปีที่แล้ววันนี้ '${clip(ms.title, 60)}' สำเร็จไปแล้วนะ 🎉`, href: "/plans" };
  }

  return { today, room, me, partner, queue, memory };
}
