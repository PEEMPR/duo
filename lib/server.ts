import "server-only";
import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, userFromToken, type SessionUser } from "./auth";
import type { Actor } from "./core";
import { getDb } from "./db";
import { DEFAULT_TZ } from "./time";

export function db() {
  return getDb(env.DB);
}

export function appTz(): string {
  return (env as { APP_TIMEZONE?: string }).APP_TIMEZONE || DEFAULT_TZ;
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return userFromToken(db(), jar.get(SESSION_COOKIE)?.value);
}

/** สำหรับหน้า/แอ็กชันที่ต้องล็อกอิน และต้องอยู่ในพื้นที่คู่แล้ว */
export async function requireActor(): Promise<{ user: SessionUser; actor: Actor }> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.coupleId) redirect("/onboarding");
  return { user, actor: { userId: user.id, coupleId: user.coupleId, tz: appTz() } };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
