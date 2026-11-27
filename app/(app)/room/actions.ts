"use server";

import { feedTreat, getRoomState, isRoomId, markSeen, sendHug, sendMiss, setRoom, type RoomState } from "@/lib/core";
import { db, requireActor } from "@/lib/server";

/* ห้องของน้อง — server actions (S9 จะเพิ่ม hug / miss / treat ในไฟล์นี้) */

export async function getRoomStateAction(): Promise<RoomState> {
  const { actor } = await requireActor();
  return getRoomState(db(), actor);
}

/** ids = queue item ids และ/หรือ memory id · ไม่ revalidate (ไม่ต้อง render หน้าใหม่) */
export async function markSeenAction(ids: string[]): Promise<void> {
  const { actor } = await requireActor();
  if (!Array.isArray(ids)) return;
  await markSeen(
    db(),
    actor,
    ids.filter((id): id is string => typeof id === "string"),
  );
}

export async function setRoomAction(room: string): Promise<{ ok: boolean }> {
  const { actor } = await requireActor();
  if (!isRoomId(room)) return { ok: false };
  // ไม่ revalidate: UI เปลี่ยนแบบ optimistic และ poke แจ้งอีกฝ่ายเอง
  await setRoom(db(), actor, room);
  return { ok: true };
}

export type RoomActionResult = { ok: true; state: RoomState } | { ok: false; retryAfter?: number; state?: RoomState };

export async function hugAction(): Promise<RoomActionResult> {
  const { actor } = await requireActor();
  const r = await sendHug(db(), actor);
  if (!r.ok) return { ok: false, retryAfter: r.retryAfter };
  return { ok: true, state: await getRoomState(db(), actor) };
}

export async function missAction(): Promise<RoomActionResult> {
  const { actor } = await requireActor();
  const r = await sendMiss(db(), actor);
  if (!r.ok) return { ok: false, retryAfter: r.retryAfter };
  return { ok: true, state: await getRoomState(db(), actor) };
}

export async function feedTreatAction(target: "me" | "partner"): Promise<RoomActionResult> {
  const { actor } = await requireActor();
  if (target !== "me" && target !== "partner") return { ok: false };
  const r = await feedTreat(db(), actor, target);
  const state = await getRoomState(db(), actor);
  return r.ok ? { ok: true, state } : { ok: false, state };
}
