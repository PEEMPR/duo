"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, deleteSession, SESSION_COOKIE, SESSION_DAYS, signIn, signUp } from "@/lib/auth";
import * as core from "@/lib/core";
import { db, requireActor, requireUser } from "@/lib/server";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { pushSubscriptions, users } from "@/lib/db/schema";
import { isCharacterId } from "@/lib/characters";
import { deliver, NOTIFY_KINDS, REMINDER_TIMES, vapidFrom, type PushEnv } from "@/lib/notify";
import { newId } from "@/lib/ids";

export type FormState = { error?: string; hardRedirect?: string } | undefined;

/** path ที่ไม่ใช่หน้าของ Next (เช่น OAuth /authorize) ต้องโหลดหน้าใหม่ทั้งหน้า ไม่ใช่ client navigation */
const isExternalRoute = (p: string) => p.startsWith("/authorize");

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || undefined;

/** รับเฉพาะ path ภายในเว็บ กัน open redirect */
function safeNext(v: string | undefined) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";
}

async function setSessionCookie(userId: string) {
  const { token } = await createSession(db(), userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86_400 });
}

/* ── Auth ── */

export async function signupAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const id = await signUp(db(), { email: str(f, "email"), name: str(f, "name"), password: String(f.get("password") ?? "") });
    await setSessionCookie(id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const next = safeNext(opt(f, "next"));
  if (isExternalRoute(next)) return { hardRedirect: next };
  redirect(next === "/dashboard" ? "/onboarding" : next);
}

export async function loginAction(_: FormState, f: FormData): Promise<FormState> {
  const id = await signIn(db(), str(f, "email"), String(f.get("password") ?? ""));
  if (!id) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  await setSessionCookie(id);
  const next = safeNext(opt(f, "next"));
  if (isExternalRoute(next)) return { hardRedirect: next };
  redirect(next);
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(db(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

/* ── Couple ── */

export async function createCoupleAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  await core.createCouple(db(), user.id, { name: str(f, "name"), anniversary: opt(f, "anniversary") });
  redirect("/dashboard");
}

export async function joinCoupleAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await core.joinCouple(db(), user.id, str(f, "code"));
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect("/dashboard");
}

export async function updateCoupleAction(f: FormData) {
  const { actor } = await requireActor();
  await core.updateCouple(db(), actor, { name: opt(f, "name"), anniversary: str(f, "anniversary") || null });
  revalidatePath("/", "layout");
}

export async function updateThemeAction(f: FormData) {
  const { actor } = await requireActor();
  await core.updateCouple(db(), actor, { theme: str(f, "theme") });
  revalidatePath("/", "layout");
}

export async function regenerateInviteAction() {
  const { actor } = await requireActor();
  await core.regenerateInvite(db(), actor);
  revalidatePath("/settings");
}

/* ── Events ── */

export async function createEventAction(f: FormData) {
  const { actor } = await requireActor();
  const date = str(f, "date");
  try {
    await core.createEvent(db(), actor, {
      title: str(f, "title"),
      date,
      time: opt(f, "time"),
      endDate: opt(f, "endDate"),
      endTime: opt(f, "endTime"),
      location: opt(f, "location"),
      description: opt(f, "description"),
    });
  } catch (e) {
    const msg = e instanceof Error && !("issues" in e) ? e.message : "ข้อมูลนัดไม่ถูกต้อง";
    redirect(`/calendar?d=${encodeURIComponent(date)}&err=${encodeURIComponent(msg)}`);
  }
  redirect(`/calendar?d=${date}`);
}

export async function deleteEventAction(f: FormData) {
  const { actor } = await requireActor();
  await core.deleteEvent(db(), actor, str(f, "id"));
  revalidatePath("/calendar");
}

/* ── Lists ── */

export async function createListAction(f: FormData) {
  const { actor } = await requireActor();
  const kind = str(f, "kind") as (typeof core.LIST_KINDS)[number];
  const id = await core.createList(db(), actor, { name: str(f, "name"), kind: core.LIST_KINDS.includes(kind) ? kind : "todo" });
  redirect(`/lists/${id}`);
}

export async function deleteListAction(f: FormData) {
  const { actor } = await requireActor();
  await core.deleteList(db(), actor, str(f, "id"));
  redirect("/lists");
}

export async function addItemAction(f: FormData) {
  const { actor } = await requireActor();
  const listId = str(f, "listId");
  const text = str(f, "text");
  if (text) await core.addListItem(db(), actor, { list: listId, text, assigneeId: opt(f, "assigneeId") ?? null, dueDate: opt(f, "dueDate") ?? null });
  revalidatePath(`/lists/${listId}`);
}

export async function toggleItemAction(f: FormData) {
  const { actor } = await requireActor();
  await core.setListItemDone(db(), actor, str(f, "id"), str(f, "done") === "1");
  revalidatePath("/", "layout");
}

export async function deleteItemAction(f: FormData) {
  const { actor } = await requireActor();
  await core.deleteListItem(db(), actor, str(f, "id"));
  revalidatePath("/", "layout");
}

/* ── Check-in ── */

export async function checkinAction(f: FormData) {
  const { actor } = await requireActor();
  await core.submitCheckin(db(), actor, {
    mood: Number(f.get("mood")),
    energy: Number(f.get("energy")),
    gratitude: opt(f, "gratitude"),
    need: opt(f, "need"),
    note: opt(f, "note"),
  });
  revalidatePath("/", "layout");
  redirect("/checkin");
}

/* ── Plans ── */

export async function createPlanAction(f: FormData) {
  const { actor } = await requireActor();
  await core.createPlan(db(), actor, {
    title: str(f, "title"),
    description: opt(f, "description"),
    targetDate: opt(f, "targetDate"),
    milestones: str(f, "milestones").split("\n"),
  });
  revalidatePath("/plans");
}

export async function planStatusAction(f: FormData) {
  const { actor } = await requireActor();
  const status = str(f, "status") as (typeof core.PLAN_STATUS)[number];
  if (core.PLAN_STATUS.includes(status)) await core.updatePlanStatus(db(), actor, str(f, "id"), status);
  revalidatePath("/plans");
}

export async function deletePlanAction(f: FormData) {
  const { actor } = await requireActor();
  await core.deletePlan(db(), actor, str(f, "id"));
  revalidatePath("/plans");
}

export async function addMilestoneAction(f: FormData) {
  const { actor } = await requireActor();
  const title = str(f, "title");
  if (title) await core.addMilestone(db(), actor, str(f, "planId"), title, opt(f, "dueDate"));
  revalidatePath("/plans");
}

export async function toggleMilestoneAction(f: FormData) {
  const { actor } = await requireActor();
  await core.setMilestoneDone(db(), actor, str(f, "id"), str(f, "done") === "1");
  revalidatePath("/plans");
}

/* ── Notes ── */

export async function saveNoteAction(f: FormData) {
  const { actor } = await requireActor();
  const id = await core.saveNote(db(), actor, {
    id: opt(f, "id"),
    title: str(f, "title"),
    body: String(f.get("body") ?? ""),
    visibility: str(f, "visibility") === "private" ? "private" : "shared",
    pinned: f.get("pinned") === "on",
  });
  revalidatePath("/notes");
  redirect(`/notes/${id}?saved=1`);
}

export async function deleteNoteAction(f: FormData) {
  const { actor } = await requireActor();
  await core.deleteNote(db(), actor, str(f, "id"));
  redirect("/notes");
}

/* ── โปรไฟล์ ── */

export async function updateNameAction(f: FormData) {
  const user = await requireUser();
  const name = str(f, "displayName").replace(/\s+/g, " ").slice(0, 40);
  if (name) await db().update(users).set({ name }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
}

/* ── ตัวละคร ── */

export async function setCharacterAction(f: FormData) {
  const user = await requireUser();
  const c = str(f, "character");
  if (isCharacterId(c)) await db().update(users).set({ character: c }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
}

/* ── แจ้งเตือน (Web Push) ── */

type ClientSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function savePushSubscriptionAction(sub: ClientSubscription, userAgent: string) {
  const user = await requireUser();
  const ok = typeof sub?.endpoint === "string" && /^https:\/\//.test(sub.endpoint) && sub.keys?.p256dh && sub.keys?.auth;
  if (!ok) return { error: "ข้อมูลอุปกรณ์ไม่ถูกต้อง" };
  await db()
    .insert(pushSubscriptions)
    .values({ id: newId(), userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 200) })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  revalidatePath("/settings");
  return { ok: true };
}

export async function removePushSubscriptionAction(endpoint: string) {
  const user = await requireUser();
  await db().delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
  revalidatePath("/settings");
}

export async function sendTestPushAction() {
  const user = await requireUser();
  const vapid = vapidFrom(env as unknown as PushEnv);
  if (!vapid) return { error: "ยังไม่ได้ตั้งค่าคีย์ VAPID" };
  const sent = await deliver(db(), vapid, user.id, {
    title: "💞 Duo ทดสอบแจ้งเตือน",
    body: "ถ้าเห็นข้อความนี้ แปลว่าเครื่องนี้รับแจ้งเตือนได้แล้ว 🎉",
    url: "/settings",
    icon: "/icon-192.png",
    tag: "test",
  });
  return sent ? { ok: true, sent } : { error: "ส่งไม่สำเร็จ ลองปิดแล้วเปิดการแจ้งเตือนบนเครื่องนี้ใหม่" };
}

export async function updateNotifyPrefsAction(f: FormData) {
  const user = await requireUser();
  const prefs = Object.fromEntries(NOTIFY_KINDS.map((k) => [k.id, f.get(k.id) === "on"]));
  const time = str(f, "reminderTime");
  await db()
    .update(users)
    .set({ notifyPrefs: JSON.stringify(prefs), ...(REMINDER_TIMES.includes(time as never) ? { checkinReminderTime: time } : {}) })
    .where(eq(users.id, user.id));
  revalidatePath("/settings");
}
