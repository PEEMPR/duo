/**
 * Business logic ทั้งหมดอยู่ที่นี่ — ทั้งหน้าเว็บ (server actions) และ MCP tools เรียกผ่านไฟล์นี้
 * เพื่อให้กฎสิทธิ์ (ข้อมูลต่อคู่, โน้ตส่วนตัว, การซ่อนเช็กอิน) เหมือนกันทุกช่องทาง
 */
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db";
import { checkins, coupleMembers, couples, events, listItems, lists, milestones, notes, plans, users } from "../db/schema";
import { newId, newInviteCode } from "../ids";
import { isThemeId } from "../themes";
import { addDays, daysBetween, DEFAULT_TZ, isoToLocalYmd, localToIso, todayIn } from "../time";

export type Actor = { userId: string; coupleId: string; tz?: string };

export class NotFoundError extends Error {
  constructor(what = "ไม่พบข้อมูล") {
    super(what);
  }
}

const tzOf = (a: Actor) => a.tz || DEFAULT_TZ;
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ต้องเป็น YYYY-MM-DD");
const hm = z.string().regex(/^\d{2}:\d{2}$/, "รูปแบบเวลาต้องเป็น HH:MM");

/* ───────────── Couple ───────────── */

export async function createCouple(db: DB, userId: string, input: { name: string; anniversary?: string | null }) {
  const existing = await db.select().from(coupleMembers).where(eq(coupleMembers.userId, userId)).get();
  if (existing) return existing.coupleId;
  const id = newId();
  await db.batch([
    db.insert(couples).values({ id, name: input.name.trim() || "เราสองคน", anniversary: input.anniversary || null, inviteCode: newInviteCode() }),
    db.insert(coupleMembers).values({ coupleId: id, userId }),
  ]);
  await seedDefaults(db, { userId, coupleId: id });
  return id;
}

async function seedDefaults(db: DB, a: Actor) {
  await db.insert(lists).values([
    { id: newId(), coupleId: a.coupleId, name: "งานบ้าน", kind: "todo" },
    { id: newId(), coupleId: a.coupleId, name: "ของที่ต้องซื้อ", kind: "shopping" },
    { id: newId(), coupleId: a.coupleId, name: "ที่อยากไปด้วยกัน", kind: "places" },
  ]);
}

export async function joinCouple(db: DB, userId: string, inviteCode: string) {
  const code = inviteCode.trim().toUpperCase();
  const couple = await db.select().from(couples).where(eq(couples.inviteCode, code)).get();
  if (!couple) throw new Error("ไม่พบโค้ดเชิญนี้");
  const members = await db.select().from(coupleMembers).where(eq(coupleMembers.coupleId, couple.id)).all();
  if (members.some((m) => m.userId === userId)) return couple.id;
  if (members.length >= 2) throw new Error("พื้นที่นี้มีสมาชิกครบ 2 คนแล้ว");
  const mine = await db.select().from(coupleMembers).where(eq(coupleMembers.userId, userId)).get();
  if (mine) throw new Error("บัญชีนี้อยู่ในพื้นที่คู่อื่นแล้ว");
  await db.insert(coupleMembers).values({ coupleId: couple.id, userId });
  return couple.id;
}

export async function getCouple(db: DB, a: Actor) {
  const couple = await db.select().from(couples).where(eq(couples.id, a.coupleId)).get();
  if (!couple) throw new NotFoundError();
  const members = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(coupleMembers)
    .innerJoin(users, eq(users.id, coupleMembers.userId))
    .where(eq(coupleMembers.coupleId, a.coupleId))
    .all();
  const me = members.find((m) => m.id === a.userId)!;
  const partner = members.find((m) => m.id !== a.userId) ?? null;
  return { ...couple, members, me, partner };
}

export async function updateCouple(db: DB, a: Actor, input: { name?: string; anniversary?: string | null; theme?: string }) {
  if (input.theme !== undefined && !isThemeId(input.theme)) throw new Error("ไม่มีธีมนี้");
  await db
    .update(couples)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.anniversary !== undefined ? { anniversary: input.anniversary || null } : {}),
      ...(input.theme ? { theme: input.theme } : {}),
    })
    .where(eq(couples.id, a.coupleId));
}

export async function regenerateInvite(db: DB, a: Actor) {
  const code = newInviteCode();
  await db.update(couples).set({ inviteCode: code }).where(eq(couples.id, a.coupleId));
  return code;
}

/* ───────────── Events (ปฏิทิน) ───────────── */

export const EventInput = z.object({
  title: z.string().trim().min(1).max(200),
  date: ymd.describe("วันที่เริ่ม YYYY-MM-DD"),
  time: hm.optional().describe("เวลาเริ่ม HH:MM (ไม่ใส่ทั้ง time และ endTime = นัดทั้งวัน)"),
  endDate: ymd.optional().describe("วันที่สิ้นสุด YYYY-MM-DD สำหรับนัดหลายวัน (ไม่ใส่ = วันเดียวกับวันเริ่ม)"),
  endTime: hm.optional().describe("เวลาสิ้นสุด HH:MM"),
  location: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
});

/** จำนวนวันสูงสุดที่นัดหนึ่งครอบคลุมได้ (กันพิมพ์ปีผิด) */
const MAX_EVENT_DAYS = 366;

export async function createEvent(db: DB, a: Actor, raw: z.input<typeof EventInput>) {
  const input = EventInput.parse(raw);
  const tz = tzOf(a);
  const allDay = !input.time && !input.endTime;
  const endDate = input.endDate || input.date;
  if (endDate < input.date) throw new Error("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
  if (daysBetween(input.date, endDate) > MAX_EVENT_DAYS) throw new Error("นัดหนึ่งยาวได้ไม่เกิน 1 ปี");
  const startAt = localToIso(input.date, allDay ? "00:00" : (input.time ?? "00:00"), tz);
  // นัดทั้งวัน: จบท้ายวันสุดท้าย · มีเวลา: ใช้เวลาสิ้นสุดที่ระบุ (ถ้าข้ามวันแต่ไม่ระบุเวลา = ท้ายวันสุดท้าย)
  const endAt = allDay
    ? localToIso(endDate, "23:59", tz)
    : input.endTime
      ? localToIso(endDate, input.endTime, tz)
      : endDate !== input.date
        ? localToIso(endDate, "23:59", tz)
        : null;
  if (endAt && endAt < startAt) throw new Error("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
  const id = newId();
  await db.insert(events).values({
    id,
    coupleId: a.coupleId,
    title: input.title,
    description: input.description || null,
    location: input.location || null,
    allDay,
    startAt,
    endAt,
    createdBy: a.userId,
  });
  return id;
}

/** นัดที่ "คาบเกี่ยว" ช่วงวันที่ (รวมนัดหลายวันที่เริ่มก่อนช่วงแต่ยังไม่จบ) */
export async function listEvents(db: DB, a: Actor, range: { from: string; to: string }) {
  const tz = tzOf(a);
  const fromIso = localToIso(range.from, "00:00", tz);
  const toIso = localToIso(addDays(range.to, 1), "00:00", tz);
  return db
    .select()
    .from(events)
    .where(and(eq(events.coupleId, a.coupleId), lt(events.startAt, toIso), gte(sql`coalesce(${events.endAt}, ${events.startAt})`, fromIso)))
    .orderBy(asc(events.startAt))
    .all();
}

/** วันท้องถิ่นทั้งหมดที่นัดครอบคลุม (สำหรับวาดบนปฏิทิน) */
export function eventDays(e: { startAt: string; endAt: string | null }, tz: string = DEFAULT_TZ): string[] {
  const first = isoToLocalYmd(e.startAt, tz);
  const last = e.endAt ? isoToLocalYmd(e.endAt, tz) : first;
  const days: string[] = [];
  for (let d = first; d <= last && days.length <= MAX_EVENT_DAYS; d = addDays(d, 1)) days.push(d);
  return days;
}

export async function deleteEvent(db: DB, a: Actor, id: string) {
  const res = await db.delete(events).where(and(eq(events.id, id), eq(events.coupleId, a.coupleId))).returning({ id: events.id });
  if (!res.length) throw new NotFoundError("ไม่พบนัดหมายนี้");
}

/* ───────────── Lists ───────────── */

export const LIST_KINDS = ["todo", "shopping", "wishlist", "places", "other"] as const;

export async function getLists(db: DB, a: Actor) {
  const rows = await db.select().from(lists).where(eq(lists.coupleId, a.coupleId)).orderBy(asc(lists.createdAt)).all();
  const counts = await db
    .select({ listId: listItems.listId, open: sql<number>`sum(case when ${listItems.done} = 0 then 1 else 0 end)`, total: sql<number>`count(*)` })
    .from(listItems)
    .where(eq(listItems.coupleId, a.coupleId))
    .groupBy(listItems.listId)
    .all();
  return rows.map((l) => {
    const c = counts.find((x) => x.listId === l.id);
    return { ...l, open: Number(c?.open ?? 0), total: Number(c?.total ?? 0) };
  });
}

export async function createList(db: DB, a: Actor, input: { name: string; kind?: (typeof LIST_KINDS)[number] }) {
  const id = newId();
  await db.insert(lists).values({ id, coupleId: a.coupleId, name: input.name.trim().slice(0, 100) || "รายการใหม่", kind: input.kind ?? "todo" });
  return id;
}

export async function deleteList(db: DB, a: Actor, id: string) {
  await db.delete(lists).where(and(eq(lists.id, id), eq(lists.coupleId, a.coupleId)));
}

/** หา list ด้วย id หรือชื่อ (MCP ใช้ชื่อได้ เช่น "ของที่ต้องซื้อ") */
export async function resolveList(db: DB, a: Actor, idOrName: string) {
  const all = await db.select().from(lists).where(eq(lists.coupleId, a.coupleId)).all();
  const q = idOrName.trim().toLowerCase();
  const found = all.find((l) => l.id === idOrName) ?? all.find((l) => l.name.toLowerCase() === q) ?? all.find((l) => l.name.toLowerCase().includes(q));
  if (!found) throw new NotFoundError(`ไม่พบรายการ "${idOrName}" (มี: ${all.map((l) => l.name).join(", ")})`);
  return found;
}

export async function getListWithItems(db: DB, a: Actor, idOrName: string) {
  const list = await resolveList(db, a, idOrName);
  const items = await db.select().from(listItems).where(eq(listItems.listId, list.id)).orderBy(asc(listItems.done), desc(listItems.createdAt)).all();
  return { ...list, items };
}

export async function addListItem(db: DB, a: Actor, input: { list: string; text: string; assigneeId?: string | null; dueDate?: string | null }) {
  const list = await resolveList(db, a, input.list);
  if (input.assigneeId) await assertMember(db, a, input.assigneeId);
  const id = newId();
  await db.insert(listItems).values({
    id,
    listId: list.id,
    coupleId: a.coupleId,
    text: input.text.trim().slice(0, 500),
    assigneeId: input.assigneeId || null,
    dueDate: input.dueDate || null,
    createdBy: a.userId,
  });
  return { id, listName: list.name };
}

export async function setListItemDone(db: DB, a: Actor, id: string, done: boolean) {
  const res = await db
    .update(listItems)
    .set({ done, doneAt: done ? new Date().toISOString() : null })
    .where(and(eq(listItems.id, id), eq(listItems.coupleId, a.coupleId)))
    .returning({ id: listItems.id, text: listItems.text });
  if (!res.length) throw new NotFoundError("ไม่พบรายการย่อยนี้");
  return res[0];
}

export async function deleteListItem(db: DB, a: Actor, id: string) {
  await db.delete(listItems).where(and(eq(listItems.id, id), eq(listItems.coupleId, a.coupleId)));
}

export async function openItems(db: DB, a: Actor, limit = 10) {
  return db
    .select({ id: listItems.id, text: listItems.text, dueDate: listItems.dueDate, assigneeId: listItems.assigneeId, listId: listItems.listId, listName: lists.name })
    .from(listItems)
    .innerJoin(lists, eq(lists.id, listItems.listId))
    .where(and(eq(listItems.coupleId, a.coupleId), eq(listItems.done, false)))
    .orderBy(sql`${listItems.dueDate} is null`, asc(listItems.dueDate), desc(listItems.createdAt))
    .limit(limit)
    .all();
}

async function assertMember(db: DB, a: Actor, userId: string) {
  const m = await db.select().from(coupleMembers).where(and(eq(coupleMembers.coupleId, a.coupleId), eq(coupleMembers.userId, userId))).get();
  if (!m) throw new Error("ผู้รับผิดชอบต้องเป็นสมาชิกของคู่นี้");
}

/* ───────────── Check-ins ───────────── */

export const CheckinInput = z.object({
  mood: z.coerce.number().int().min(1).max(5).describe("อารมณ์ 1 (แย่) - 5 (ดีมาก)"),
  energy: z.coerce.number().int().min(1).max(5).describe("พลังงาน 1-5"),
  gratitude: z.string().max(1000).optional().describe("วันนี้ขอบคุณเรื่องอะไร"),
  need: z.string().max(1000).optional().describe("วันนี้อยากได้อะไรจากอีกฝ่าย"),
  note: z.string().max(2000).optional(),
});

export async function submitCheckin(db: DB, a: Actor, raw: z.input<typeof CheckinInput>) {
  const input = CheckinInput.parse(raw);
  const date = todayIn(tzOf(a));
  const values = { mood: input.mood, energy: input.energy, gratitude: input.gratitude || null, need: input.need || null, note: input.note || null };
  await db
    .insert(checkins)
    .values({ id: newId(), coupleId: a.coupleId, userId: a.userId, date, ...values })
    .onConflictDoUpdate({ target: [checkins.userId, checkins.date], set: values });
  return date;
}

/**
 * กฎความเป็นส่วนตัว: จะเห็นเช็กอินของอีกฝ่ายในวันไหน ก็ต่อเมื่อตัวเองเช็กอินวันนั้นแล้ว
 * (กันการ "แอบดูก่อนแล้วค่อยตอบ")
 */
export async function getCheckins(db: DB, a: Actor, days = 14) {
  const today = todayIn(tzOf(a));
  const from = addDays(today, -(days - 1));
  const rows = await db
    .select()
    .from(checkins)
    .where(and(eq(checkins.coupleId, a.coupleId), gte(checkins.date, from)))
    .orderBy(desc(checkins.date))
    .all();
  const myDates = new Set(rows.filter((r) => r.userId === a.userId).map((r) => r.date));
  const result: { date: string; mine: (typeof rows)[number] | null; partner: (typeof rows)[number] | null; partnerHidden: boolean }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, -i);
    const mine = rows.find((r) => r.date === date && r.userId === a.userId) ?? null;
    const partnerRow = rows.find((r) => r.date === date && r.userId !== a.userId) ?? null;
    const visible = myDates.has(date);
    result.push({ date, mine, partner: visible ? partnerRow : null, partnerHidden: !!partnerRow && !visible });
  }
  return { today, days: result };
}

export async function checkinStreak(db: DB, a: Actor) {
  const rows = await db
    .select({ date: checkins.date })
    .from(checkins)
    .where(and(eq(checkins.coupleId, a.coupleId), eq(checkins.userId, a.userId)))
    .orderBy(desc(checkins.date))
    .limit(400)
    .all();
  const set = new Set(rows.map((r) => r.date));
  let d = todayIn(tzOf(a));
  if (!set.has(d)) d = addDays(d, -1); // ยังไม่เช็กอินวันนี้ก็ยังไม่ตัด streak
  let streak = 0;
  while (set.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

/* ───────────── Plans ───────────── */

export const PLAN_STATUS = ["idea", "planning", "doing", "done"] as const;

export async function getPlans(db: DB, a: Actor) {
  const rows = await db.select().from(plans).where(eq(plans.coupleId, a.coupleId)).orderBy(sql`case ${plans.status} when 'doing' then 0 when 'planning' then 1 when 'idea' then 2 else 3 end`, asc(plans.targetDate)).all();
  const ms = rows.length
    ? await db.select().from(milestones).where(inArray(milestones.planId, rows.map((r) => r.id))).orderBy(asc(milestones.createdAt)).all()
    : [];
  return rows.map((p) => ({ ...p, milestones: ms.filter((m) => m.planId === p.id) }));
}

export async function createPlan(db: DB, a: Actor, input: { title: string; description?: string | null; targetDate?: string | null; status?: (typeof PLAN_STATUS)[number]; milestones?: string[] }) {
  const id = newId();
  await db.insert(plans).values({
    id,
    coupleId: a.coupleId,
    title: input.title.trim().slice(0, 200),
    description: input.description || null,
    targetDate: input.targetDate || null,
    status: input.status ?? "planning",
    createdBy: a.userId,
  });
  const titles = (input.milestones ?? []).map((t) => t.trim()).filter(Boolean);
  if (titles.length) await db.insert(milestones).values(titles.map((title) => ({ id: newId(), planId: id, coupleId: a.coupleId, title })));
  return id;
}

export async function updatePlanStatus(db: DB, a: Actor, id: string, status: (typeof PLAN_STATUS)[number]) {
  await db.update(plans).set({ status }).where(and(eq(plans.id, id), eq(plans.coupleId, a.coupleId)));
}

export async function deletePlan(db: DB, a: Actor, id: string) {
  await db.delete(plans).where(and(eq(plans.id, id), eq(plans.coupleId, a.coupleId)));
}

export async function addMilestone(db: DB, a: Actor, planId: string, title: string, dueDate?: string | null) {
  const plan = await db.select().from(plans).where(and(eq(plans.id, planId), eq(plans.coupleId, a.coupleId))).get();
  if (!plan) throw new NotFoundError("ไม่พบแผนนี้");
  const id = newId();
  await db.insert(milestones).values({ id, planId, coupleId: a.coupleId, title: title.trim().slice(0, 200), dueDate: dueDate || null });
  return id;
}

export async function setMilestoneDone(db: DB, a: Actor, id: string, done: boolean) {
  const res = await db.update(milestones).set({ done }).where(and(eq(milestones.id, id), eq(milestones.coupleId, a.coupleId))).returning({ id: milestones.id });
  if (!res.length) throw new NotFoundError("ไม่พบ milestone นี้");
}

/* ───────────── Notes ───────────── */

const visibleNotes = (a: Actor) => and(eq(notes.coupleId, a.coupleId), or(eq(notes.visibility, "shared"), eq(notes.authorId, a.userId)));

export async function listNotes(db: DB, a: Actor, opts: { query?: string; limit?: number } = {}) {
  const q = opts.query?.trim();
  const where = q ? and(visibleNotes(a), or(sql`${notes.title} like ${"%" + q + "%"}`, sql`${notes.body} like ${"%" + q + "%"}`)) : visibleNotes(a);
  return db.select().from(notes).where(where).orderBy(desc(notes.pinned), desc(notes.updatedAt)).limit(opts.limit ?? 100).all();
}

export async function getNote(db: DB, a: Actor, id: string) {
  const n = await db.select().from(notes).where(and(eq(notes.id, id), visibleNotes(a))).get();
  if (!n) throw new NotFoundError("ไม่พบโน้ตนี้");
  return n;
}

export async function saveNote(db: DB, a: Actor, input: { id?: string; title: string; body: string; visibility?: "shared" | "private"; pinned?: boolean }) {
  const values = {
    title: input.title.trim().slice(0, 200) || "ไม่มีชื่อ",
    body: input.body.slice(0, 50_000),
    visibility: input.visibility ?? "shared",
    pinned: !!input.pinned,
    updatedAt: new Date().toISOString(),
  };
  if (input.id) {
    // แก้ได้เฉพาะโน้ตที่มองเห็น; โน้ตส่วนตัวแก้ได้เฉพาะเจ้าของ
    const n = await getNote(db, a, input.id);
    if (n.visibility === "private" && n.authorId !== a.userId) throw new NotFoundError();
    if (n.authorId !== a.userId) values.visibility = n.visibility; // เปลี่ยนการมองเห็นได้เฉพาะเจ้าของ
    await db.update(notes).set(values).where(eq(notes.id, input.id));
    return input.id;
  }
  const id = newId();
  await db.insert(notes).values({ id, coupleId: a.coupleId, authorId: a.userId, ...values });
  return id;
}

export async function deleteNote(db: DB, a: Actor, id: string) {
  const n = await getNote(db, a, id);
  if (n.authorId !== a.userId) throw new Error("ลบได้เฉพาะโน้ตที่ตัวเองเขียน");
  await db.delete(notes).where(eq(notes.id, id));
}

/* ───────────── Summary (Dashboard + MCP) ───────────── */

export async function getSummary(db: DB, a: Actor) {
  const tz = tzOf(a);
  const today = todayIn(tz);
  const [couple, upcoming, items, planRows, ci, streak, recentNotes] = await Promise.all([
    getCouple(db, a),
    listEvents(db, a, { from: today, to: addDays(today, 6) }),
    openItems(db, a, 8),
    getPlans(db, a),
    getCheckins(db, a, 7),
    checkinStreak(db, a),
    listNotes(db, a, { limit: 3 }),
  ]);
  const todayCi = ci.days[0];
  const moods = ci.days.map((d) => ({ date: d.date, mine: d.mine?.mood ?? null, partner: d.partner?.mood ?? null })).reverse();
  return {
    today,
    couple: { name: couple.name, anniversary: couple.anniversary, me: couple.me, partner: couple.partner },
    checkin: {
      doneByMe: !!todayCi.mine,
      doneByPartner: !!todayCi.partner || todayCi.partnerHidden,
      partnerToday: todayCi.partner,
      streak,
      moods,
    },
    upcomingEvents: upcoming,
    openItems: items,
    activePlans: planRows.filter((p) => p.status !== "done").slice(0, 4),
    recentNotes: recentNotes.map((n) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt, visibility: n.visibility })),
  };
}
