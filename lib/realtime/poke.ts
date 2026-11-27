/**
 * แจ้ง client ที่เปิดห้องของน้องอยู่ว่ามีอะไรเปลี่ยน (ผ่าน Durable Object CoupleRoom → WebSocket)
 * ส่งแค่ {type} ไม่มีข้อมูลจริง · client ไป refetch ผ่าน server action ที่ตรวจสิทธิ์เอง
 * ต้องไม่ throw เด็ดขาด (เรียกหลังบันทึกกิจกรรมสำเร็จแล้ว — realtime พังต้องไม่ทำให้ action พัง)
 */
import { env } from "cloudflare:workers";

const POKE_TIMEOUT_MS = 1000; // รันใน server action / MCP tool ทุกตัวที่บันทึกกิจกรรม — ห้ามถ่วงนาน

export async function pokeRoom(coupleId: string, type: "activity" | "room"): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ns = (env as { ROOM?: DurableObjectNamespace }).ROOM;
    if (!ns || !coupleId) return;
    const stub = ns.get(ns.idFromName(coupleId));
    const send = stub
      .fetch("https://room/poke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: type === "room" ? "room" : "activity" }),
      })
      .then((res) => res.body?.cancel())
      .catch((e: unknown) => console.warn("pokeRoom failed", e));
    // DO ช้า/ค้าง → ไม่รอเกิน POKE_TIMEOUT_MS
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        console.warn("pokeRoom timed out");
        resolve();
      }, POKE_TIMEOUT_MS);
    });
    await Promise.race([send, timeout]);
  } catch (e) {
    console.warn("pokeRoom failed", e);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
