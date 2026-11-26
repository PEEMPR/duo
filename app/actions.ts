"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, deleteSession, SESSION_COOKIE, SESSION_DAYS, signIn, signUp } from "@/lib/auth";
import * as core from "@/lib/core";
import { db, requireActor, requireUser } from "@/lib/server";

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
