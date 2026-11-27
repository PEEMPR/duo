"use server";

import { hasNewForViewer } from "@/lib/core/pet-corner";
import { db, requireActor } from "@/lib/server";

/** เช็กว่าอีกฝ่ายมีเรื่องใหม่ไหม (เรียกจาก components/pet/corner.tsx แบบ throttle) */
export async function checkCornerNew(): Promise<boolean> {
  const { actor } = await requireActor();
  try {
    return await hasNewForViewer(db(), actor);
  } catch {
    return false;
  }
}
