/**
 * วันเกิด: เก็บเป็นข้อมูลผู้ใช้ (users.birthday) ปักบนปฏิทินร่วมทุกปี
 * ซ่อน (showBirthday=false) = ไม่มีใครเห็นเลย รวมเจ้าของ — ทุกช่องทางอ่านผ่าน listBirthdays/birthdaysOn เท่านั้น
 * ไม่แสดงอายุ (เก็บปีไว้เฉยๆ)
 */
import { and, eq, isNotNull } from "drizzle-orm";
import type { DB } from "../db";
import { addDays } from "../time";
import { coupleMembers, users } from "../db/schema";
import type { Actor } from "./index";

export const BIRTHDAY_ERRORS = { invalid: "วันเกิดไม่ถูกต้อง", future: "วันเกิดต้องไม่อยู่ในอนาคต" } as const;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) => (m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function parseBirthday(v: unknown, today: string): { value: string | null; error?: string } {
  if (v === null || v === undefined) return { value: null };
  if (typeof v !== "string") return { value: null, error: BIRTHDAY_ERRORS.invalid };
  const s = v.trim();
  if (s === "") return { value: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return { value: null, error: BIRTHDAY_ERRORS.invalid };
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return { value: null, error: BIRTHDAY_ERRORS.invalid };
  if (s > today) return { value: null, error: BIRTHDAY_ERRORS.future };
  return { value: s };
}

export function birthdayOccurrence(birthday: string, year: number): string {
  const mo = Number(birthday.slice(5, 7));
  let d = Number(birthday.slice(8, 10));
  if (mo === 2 && d === 29 && !isLeap(year)) d = 28;
  return `${pad(year, 4)}-${pad(mo)}-${pad(d)}`;
}

export type BirthdayPin = { userId: string; name: string; date: string; isMe: boolean };

export async function getMyBirthday(db: DB, userId: string): Promise<{ birthday: string | null; show: boolean }> {
  const r = await db.select({ birthday: users.birthday, show: users.showBirthday }).from(users).where(eq(users.id, userId)).get();
  return { birthday: r?.birthday ?? null, show: r?.show ?? true };
}

export async function setBirthday(db: DB, userId: string, raw: { birthday: unknown; show: boolean }, today: string): Promise<void> {
  const p = parseBirthday(raw.birthday, today);
  if (p.error) throw new Error(p.error);
  await db.update(users).set({ birthday: p.value, showBirthday: !!raw.show }).where(eq(users.id, userId));
}

/** สมาชิกคู่ที่มีวันเกิดและไม่ได้ซ่อน — จุดบังคับความเป็นส่วนตัวจุดเดียว */
async function shownMembers(db: DB, coupleId: string) {
  const rows = await db
    .select({ userId: users.id, name: users.name, birthday: users.birthday })
    .from(coupleMembers)
    .innerJoin(users, eq(users.id, coupleMembers.userId))
    .where(and(eq(coupleMembers.coupleId, coupleId), isNotNull(users.birthday), eq(users.showBirthday, true)))
    .all();
  return rows.filter((r): r is { userId: string; name: string; birthday: string } => !!r.birthday);
}

/** ช่วงที่ยาวสุดที่ใช้สร้างหมุด (วัน) — เกินนี้ตัดทิ้งที่ from+400 เพื่อคุม CPU */
export const MAX_BIRTHDAY_RANGE_DAYS = 400;

/** สร้างหมุดแบบ pure: ปักทุกปี (รวมปีก่อนเกิด) ไม่เปิดเผยปีเกิด/อายุ; ช่วงยาวเกิน 400 วันถูกตัดที่ from+400 */
export function buildBirthdayPins(
  members: { userId: string; name: string; birthday: string }[],
  viewerId: string,
  range: { from: string; to: string },
): BirthdayPin[] {
  const maxTo = addDays(range.from, MAX_BIRTHDAY_RANGE_DAYS);
  const to = range.to > maxTo ? maxTo : range.to;
  if (to < range.from) return [];
  const y1 = Number(range.from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  const out: BirthdayPin[] = [];
  for (const m of members) {
    for (let y = y1; y <= y2; y++) {
      const date = birthdayOccurrence(m.birthday, y);
      if (date >= range.from && date <= to) out.push({ userId: m.userId, name: m.name, date, isMe: m.userId === viewerId });
    }
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.name.localeCompare(y.name)));
}

export async function listBirthdays(db: DB, a: Actor, range: { from: string; to: string }): Promise<BirthdayPin[]> {
  return buildBirthdayPins(await shownMembers(db, a.coupleId), a.userId, range);
}

export async function birthdaysOn(db: DB, coupleId: string, ymd: string): Promise<{ userId: string; name: string }[]> {
  const members = await shownMembers(db, coupleId);
  const y = Number(ymd.slice(0, 4));
  return members
    .filter((m) => birthdayOccurrence(m.birthday, y) === ymd)
    .map((m) => ({ userId: m.userId, name: m.name }));
}
