/**
 * กติกา "เตือนล่วงหน้า" ของนัด (pure: ใช้ได้ทั้งในเบราว์เซอร์และ Workers ไม่แตะ DB)
 *
 * - ทุกนัดมีการเตือนล่วงหน้า 1 ครั้ง ปรับได้ต่อนัด ค่าเริ่มต้น = 1 วันก่อน เวลา 09:00 (เวลาท้องถิ่น) ปิดได้ ("none")
 * - ตัวเลือกแบบวัน (dN): เตือน 09:00 ของวันที่ N วันก่อนวันเริ่มนัด (N = 1..30)
 * - ตัวเลือกแบบชั่วโมง (h2/h3/h6/h12): เตือน N ชั่วโมงก่อนเวลาเริ่ม ใช้ได้เฉพาะนัดที่มีเวลา
 *   (การเตือน 1 ชม. ก่อนเริ่มเป็นการเตือนคงที่แยกต่างหาก จึงไม่มีตัวเลือก ≤ 1 ชม. ที่นี่)
 * - ห้ามเลือกตัวเลือกที่เวลาเตือน ≤ ตอนนี้
 * - นัดหลายวันคิดจากวัน/เวลาเริ่ม
 */
import { addDays, localToIso } from "./time";

export type RemindBefore = "none" | `d${number}` | "h2" | "h3" | "h6" | "h12";

/** ตัวเลือกแบบวันที่แสดงเป็นค่าสำเร็จรูป (เรียงไกล→ใกล้) */
export const DAY_PRESETS: readonly number[] = Object.freeze([7, 3, 2, 1]);
/** ตัวเลือกแบบชั่วโมง (เรียงไกล→ใกล้) */
export const HOUR_PRESETS: readonly number[] = Object.freeze([12, 6, 3, 2]);
export const MAX_CUSTOM_DAYS = 30;
/** เวลาเตือนของตัวเลือกแบบวัน (เวลาท้องถิ่น) */
export const DAY_REMINDER_TIME = "09:00";
export const DEFAULT_REMIND_BEFORE: RemindBefore = "d1";
/**
 * ช่วงเงียบ [QUIET_START, QUIET_END) เวลาท้องถิ่น — ค่าต้องตรงกับ lib/notify (QUIET_START/QUIET_END)
 * ความหมายเดียวกับ inQuiet ของ lib/notify: hm >= "23:00" || hm < "07:00"
 * (23:00 = เงียบ, 07:00 = ไม่เงียบ) ใช้เฉพาะตอนเลือก "ค่าเริ่มต้น" — ผู้ใช้เลือกเองได้เสมอ
 * (ไม่ import จาก lib/notify เพราะไฟล์นั้นไม่ใช่ pure module)
 */
export const QUIET_START = "23:00";
export const QUIET_END = "07:00";

export type ReminderEvent = {
  /** YYYY-MM-DD (เวลาท้องถิ่น) ของวันเริ่มนัด */
  date: string;
  /** HH:MM (เวลาท้องถิ่น) หรือว่าง/null = นัดทั้งวัน */
  time?: string | null;
};

export type ReminderOption = {
  value: RemindBefore;
  label: string;
  /** เวลาเตือนเป็น ISO UTC, null สำหรับ "none" */
  at: string | null;
};

export const REMINDER_ERRORS = {
  invalid: "ค่าการเตือนไม่ถูกต้อง",
  past: "เวลาเตือนนี้ผ่านไปแล้ว เลือกเวลาที่ใกล้กว่านี้",
  hourOnAllDay: "นัดทั้งวันเลือกเตือนเป็นชั่วโมงไม่ได้",
} as const;

const DAY_RE = /^d([1-9]\d?)$/;
const HOUR_VALUES: readonly string[] = HOUR_PRESETS.map((h) => `h${h}`);
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

function dayCount(v: string): number | null {
  const m = DAY_RE.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= MAX_CUSTOM_DAYS ? n : null;
}

function hourCount(v: string): number | null {
  return HOUR_VALUES.includes(v) ? Number(v.slice(1)) : null;
}

export function isRemindBefore(v: unknown): v is RemindBefore {
  if (typeof v !== "string") return false;
  return v === "none" || dayCount(v) !== null || hourCount(v) !== null;
}

function isValidYmd(ymd: string): boolean {
  return YMD_RE.test(ymd) && addDays(ymd, 0) === ymd;
}

/** เวลาที่ใช้ได้ของนัด: string HH:MM, null = ทั้งวัน, undefined = รูปแบบผิด */
function eventTime(ev: ReminderEvent): string | null | undefined {
  const t = (ev.time ?? "").trim();
  if (!t) return null;
  return HM_RE.test(t) ? t : undefined;
}

export function isAllDayEvent(ev: ReminderEvent): boolean {
  return eventTime(ev) === null;
}

/**
 * เวลาที่จะเตือนจริง
 * null เมื่อ: "none", ตัวเลือกชั่วโมงกับนัดทั้งวัน, ค่าผิด, หรือวัน/เวลาของนัดผิดรูปแบบ
 */
export function reminderFireAt(value: RemindBefore, ev: ReminderEvent, tz: string): Date | null {
  if (value === "none" || !isValidYmd(ev.date)) return null;
  const time = eventTime(ev);
  if (time === undefined) return null;

  const days = dayCount(value);
  if (days !== null) return new Date(localToIso(addDays(ev.date, -days), DAY_REMINDER_TIME, tz));

  const hours = hourCount(value);
  if (hours !== null && time !== null) {
    const start = Date.parse(localToIso(ev.date, time, tz));
    return new Date(start - hours * 3_600_000);
  }
  return null;
}

export function remindBeforeLabel(value: RemindBefore): string {
  if (value === "none") return "ไม่เตือนล่วงหน้า";
  const days = dayCount(value);
  if (days !== null) return `${days} วันก่อน (${DAY_REMINDER_TIME})`;
  const hours = hourCount(value);
  if (hours !== null) return `ก่อน ${hours} ชม.`;
  return String(value);
}

/**
 * ตัวเลือกที่ยังเลือกได้ (เวลาเตือน > now) เรียงจากไกลสุด→ใกล้สุด แล้วตามด้วย "none" เสมอ
 * `include` (ไม่บังคับ): ค่าเพิ่มเติม เช่น dN แบบกำหนดเองที่นัดใช้อยู่ จะถูกแทรกถ้ายังอยู่ในอนาคต
 */
export function reminderOptions(
  ev: ReminderEvent,
  tz: string,
  now: Date = new Date(),
  include?: RemindBefore | null,
): ReminderOption[] {
  const time = eventTime(ev);
  const candidates: RemindBefore[] = DAY_PRESETS.map((d) => `d${d}` as RemindBefore);
  if (typeof time === "string") candidates.push(...HOUR_PRESETS.map((h) => `h${h}` as RemindBefore));
  if (include && include !== "none" && isRemindBefore(include) && !candidates.includes(include)) candidates.push(include);

  const nowMs = now.getTime();
  const valid: { value: RemindBefore; at: Date }[] = [];
  for (const value of candidates) {
    const at = reminderFireAt(value, ev, tz);
    if (at && at.getTime() > nowMs) valid.push({ value, at });
  }
  valid.sort((a, b) => a.at.getTime() - b.at.getTime());

  return [
    ...valid.map(({ value, at }) => ({ value, label: remindBeforeLabel(value), at: at.toISOString() })),
    { value: "none", label: remindBeforeLabel("none"), at: null },
  ];
}

function localHM(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

/** เวลาเตือนตกอยู่ในช่วงเงียบ [23:00, 07:00) เวลาท้องถิ่นหรือไม่ (ความหมายเดียวกับ lib/notify) */
export function isQuietTime(at: Date, tz: string): boolean {
  const hm = localHM(at, tz);
  return hm >= QUIET_START || hm < QUIET_END;
}

/**
 * ค่าเริ่มต้น: d1 ถ้ายังทัน (09:00 ไม่เคยอยู่ในช่วงเงียบ)
 * ไม่งั้นตัวเลือกที่ไกลที่สุดที่ยังอยู่ในอนาคต และเวลาเตือนไม่อยู่ในช่วงเงียบ [23:00, 07:00)
 * ไม่มีเลยก็ "none" (นัดที่มีเวลายังมีการเตือนคงที่ 1 ชม. ก่อนเริ่มอยู่แล้ว)
 * หมายเหตุ: ช่วงเงียบกรองเฉพาะค่าเริ่มต้น — reminderOptions/normalizeRemindBefore ยังให้เลือกเองได้
 */
export function defaultRemindBefore(ev: ReminderEvent, tz: string, now: Date = new Date()): RemindBefore {
  const d1 = reminderFireAt(DEFAULT_REMIND_BEFORE, ev, tz);
  if (d1 && d1.getTime() > now.getTime()) return DEFAULT_REMIND_BEFORE;
  for (const o of reminderOptions(ev, tz, now)) {
    if (o.value === "none" || !o.at) continue;
    if (!isQuietTime(new Date(o.at), tz)) return o.value;
  }
  return "none";
}

/**
 * ตรวจ/แปลงค่าที่รับมาจากฟอร์มหรือ API
 * - undefined / "" / null → ค่าเริ่มต้น (ไม่มี error)
 * - รูปแบบผิด → REMINDER_ERRORS.invalid
 * - ชั่วโมงกับนัดทั้งวัน → REMINDER_ERRORS.hourOnAllDay
 * - เวลาเตือน ≤ now → REMINDER_ERRORS.past
 * เมื่อมี error จะคืน value = ค่าเริ่มต้นไว้ให้ใช้ต่อได้ (ผู้เรียกควรแสดง error ให้ผู้ใช้)
 */
export function normalizeRemindBefore(
  value: unknown,
  ev: ReminderEvent,
  tz: string,
  now: Date = new Date(),
): { value: RemindBefore; error?: string } {
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === undefined || raw === null || raw === "") return { value: defaultRemindBefore(ev, tz, now) };

  const fallback = () => defaultRemindBefore(ev, tz, now);
  if (!isRemindBefore(raw)) return { value: fallback(), error: REMINDER_ERRORS.invalid };
  if (raw === "none") return { value: "none" };
  if (hourCount(raw) !== null && isAllDayEvent(ev)) return { value: fallback(), error: REMINDER_ERRORS.hourOnAllDay };

  const at = reminderFireAt(raw, ev, tz);
  if (!at) return { value: fallback(), error: REMINDER_ERRORS.invalid };
  if (at.getTime() <= now.getTime()) return { value: fallback(), error: REMINDER_ERRORS.past };
  return { value: raw };
}
