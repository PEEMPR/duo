import { and, eq, gt } from "drizzle-orm";
import type { DB } from "./db";
import { coupleMembers, sessions, users } from "./db/schema";
import { newId } from "./ids";

export const SESSION_COOKIE = "cs_session";
export const SESSION_DAYS = 30;

// PBKDF2 ผ่าน WebCrypto
// แพ็กเกจฟรีของ Workers ให้ CPU 10 ms ต่อ request: 100,000 รอบใช้ ~26 ms (เกิน) ส่วน 10,000 รอบใช้ ~3 ms
// ถ้าย้ายไป Workers Paid ให้เพิ่มเป็น 100_000 (ค่าสูงสุดที่ Workers รองรับ) แล้วรหัสผ่านเดิมจะถูกแฮชใหม่อัตโนมัติตอนล็อกอิน
export const PBKDF2_ITERATIONS = 10_000;

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iter, saltB64, hashB64] = stored.split("$");
  if (algo !== "pbkdf2") return false;
  const actual = new Uint8Array(await pbkdf2(password, unb64(saltB64), Number(iter)));
  const expected = unb64(hashB64);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

async function sha256(s: string): Promise<string> {
  return b64(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

export async function createSession(db: DB, userId: string): Promise<{ token: string; expires: Date }> {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: await sha256(token), userId, expiresAt: expires.toISOString() });
  return { token, expires };
}

export async function deleteSession(db: DB, token: string) {
  await db.delete(sessions).where(eq(sessions.id, await sha256(token)));
}

export type SessionUser = { id: string; email: string; name: string; coupleId: string | null };

export async function userFromToken(db: DB, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await db
    .select({ id: users.id, email: users.email, name: users.name, coupleId: coupleMembers.coupleId })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(coupleMembers, eq(coupleMembers.userId, users.id))
    .where(and(eq(sessions.id, await sha256(token)), gt(sessions.expiresAt, new Date().toISOString())))
    .get();
  return row ?? null;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export async function signUp(db: DB, input: { email: string; name: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existing) throw new Error("อีเมลนี้ถูกใช้แล้ว");
  if (input.password.length < 8) throw new Error("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");
  const id = newId();
  await db.insert(users).values({ id, email, name: input.name.trim() || email.split("@")[0], passwordHash: await hashPassword(input.password) });
  return id;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isUniqueViolation = (e: unknown): boolean => {
  for (let cur = e as { message?: unknown; cause?: unknown } | undefined, i = 0; cur && i < 5; cur = cur.cause as typeof cur, i++) {
    if (typeof cur.message === "string" && /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(cur.message)) return true;
  }
  return false;
};

/** รหัสผลลัพธ์ที่ส่งไปหน้า settings ได้ (ห้ามส่งข้อความ error ดิบ) */
export type EmailChangeError = "format" | "pw" | "same" | "taken" | "fail";

/** เปลี่ยนอีเมลล็อกอิน: ต้องยืนยันรหัสผ่านปัจจุบัน · session เดิมยังใช้ได้ (ผูกกับ userId ไม่ใช่อีเมล)
 *  คืน null เมื่อสำเร็จ หรือรหัส error · error ที่ไม่คาดคิดจะ throw ต่อ */
export async function changeEmail(db: DB, userId: string, input: { email: string; password: string }): Promise<EmailChangeError | null> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return "format";
  const user = await db.select({ email: users.email, passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).get();
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) return "pw";
  if (email === user.email) return "same";
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existing) return "taken";
  try {
    await db.update(users).set({ email }).where(eq(users.id, userId));
  } catch (e) {
    // มีคนสมัครด้วยอีเมลนี้พอดีระหว่างเช็กกับอัปเดต → UNIQUE index กันไว้
    if (isUniqueViolation(e)) return "taken";
    throw e;
  }
  return null;
}

export async function signIn(db: DB, emailRaw: string, password: string): Promise<string | null> {
  const user = await db.select().from(users).where(eq(users.email, emailRaw.trim().toLowerCase())).get();
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  // จำนวนรอบในแฮชเดิมไม่ตรงกับค่าปัจจุบัน → แฮชใหม่ด้วยค่าปัจจุบัน
  if (Number(user.passwordHash.split("$")[1]) !== PBKDF2_ITERATIONS) {
    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
  }
  return user.id;
}
