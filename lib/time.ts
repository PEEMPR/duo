export const DEFAULT_TZ = "Asia/Bangkok";

/**
 * Intl.DateTimeFormat สร้างแพง (~0.1 ms ต่อครั้ง) → เก็บไว้ใช้ซ้ำต่อ (key)
 * key ต้องระบุ locale + options + tz ให้ครบ (ผู้เรียกกำหนดเอง เพื่อไม่ต้อง JSON.stringify ทุกครั้ง)
 */
const dtfCache = new Map<string, Intl.DateTimeFormat>();
export function cachedDtf(key: string, locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = dtfCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    dtfCache.set(key, f);
  }
  return f;
}

/** YYYY-MM-DD ของ "วันนี้" ในเขตเวลาที่กำหนด */
export function todayIn(tz: string = DEFAULT_TZ, at: Date = new Date()): string {
  return cachedDtf(`ymd|${tz}`, "en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** แปลงวันที่+เวลาท้องถิ่น (เช่น "2026-12-01", "19:30") เป็น ISO UTC โดยใช้ offset ของเขตเวลา */
export function localToIso(ymd: string, hm: string | undefined, tz: string = DEFAULT_TZ): string {
  const [h, m] = (hm || "00:00").split(":").map(Number);
  const guess = new Date(`${ymd}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  const offsetMin = tzOffsetMinutes(tz, guess);
  return new Date(guess.getTime() - offsetMin * 60_000).toISOString();
}

/** ขอบเขตเวลา UTC ของหนึ่งวันท้องถิ่น */
export function dayRangeIso(ymd: string, tz: string = DEFAULT_TZ): { start: string; end: string } {
  return { start: localToIso(ymd, "00:00", tz), end: localToIso(addDays(ymd, 1), "00:00", tz) };
}

export function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = cachedDtf(`offset|${tz}`, "en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export function isoToLocalYmd(iso: string, tz: string = DEFAULT_TZ): string {
  return todayIn(tz, new Date(iso));
}

export function formatTime(iso: string, tz: string = DEFAULT_TZ): string {
  return cachedDtf(`timeTh|${tz}`, "th-TH", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function formatDateTh(ymd: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return cachedDtf(`dateTh|${JSON.stringify(opts)}`, "th-TH", { timeZone: "UTC", ...opts }).format(new Date(`${ymd}T00:00:00Z`));
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000);
}

/** ข้อความช่วงเวลาของนัด เช่น "19:00 – 21:00", "ทั้งวัน", "25 พ.ย. 19:00 → 27 พ.ย. 12:00" */
export function formatEventRange(e: { startAt: string; endAt: string | null; allDay: boolean }, tz: string = DEFAULT_TZ): string {
  const sd = isoToLocalYmd(e.startAt, tz);
  const ed = e.endAt ? isoToLocalYmd(e.endAt, tz) : sd;
  const d = (ymd: string) => formatDateTh(ymd, { day: "numeric", month: "short" });
  if (sd === ed) {
    if (e.allDay) return "ทั้งวัน";
    return `${formatTime(e.startAt, tz)}${e.endAt ? ` – ${formatTime(e.endAt, tz)}` : ""}`;
  }
  if (e.allDay) return `${d(sd)} – ${d(ed)} (ทั้งวัน)`;
  return `${d(sd)} ${formatTime(e.startAt, tz)} → ${d(ed)} ${formatTime(e.endAt!, tz)}`;
}
