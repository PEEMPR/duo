/**
 * CoupleRoom — Durable Object หนึ่งตัวต่อหนึ่งคู่ (idFromName(coupleId))
 * ถือ WebSocket ของทุกแท็บที่เปิด "ห้องของน้อง" ไว้ แล้วกระจายสัญญาณสั้น ๆ {type} ให้ client ไป refetch state เอง
 *
 *  - ใช้ WebSocket Hibernation API: runtime ถือ socket ไว้ DO ถูก evict ระหว่างรอได้ (ไม่กิน duration)
 *  - "ping" → "pong" ตอบอัตโนมัติโดยไม่ปลุก DO
 *  - ไม่มีข้อมูลผู้ใช้ใน DO และไม่ใช้ storage (ข้อมูลจริงอยู่ใน D1 · client ดึงผ่าน server action ที่ตรวจสิทธิ์)
 *
 * เข้าถึงได้ผ่าน namespace stub เท่านั้น: worker.ts ส่งต่อ /api/room/ws หลังตรวจ session แล้ว
 * และ pokeRoom() เรียก /poke ภายใน — ไม่มี route สาธารณะไปที่ /poke
 */
import { DurableObject } from "cloudflare:workers";

/** header ภายในที่ worker.ts ใส่ userId ที่ตรวจแล้ว (request สร้างใหม่ทั้งก้อน client ปลอมไม่ได้) */
export const ROOM_USER_HEADER = "x-duo-user";

/** จำนวน socket สูงสุดต่อคู่ (เกินแล้วปิดอันเก่าสุด) */
const MAX_SOCKETS = 10;
/** ข้อความ/รหัสปิดสำหรับ socket ที่ถูกเบียดออก (ต้องตรงกับ lib/realtime/client.ts) */
const EVICTED_MESSAGE = "evicted";
const CLOSE_TOO_MANY = 4000;

type Attachment = { userId: string; at: number };
type PokeType = "activity" | "room";

function attachmentOf(ws: WebSocket): Attachment | null {
  try {
    return (ws.deserializeAttachment() as Attachment | null) ?? null;
  } catch {
    return null;
  }
}

function safeClose(ws: WebSocket, code: number, reason: string) {
  try {
    ws.close(code, reason);
  } catch {
    try {
      ws.close(); // รหัสไม่ถูกต้อง หรือปิดไปแล้ว
    } catch {
      /* ปิดไปแล้ว */
    }
  }
}

export class CoupleRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // ตอบ ping ของ client โดยไม่ปลุก DO (ค่านี้ผูกกับ DO ทั้งตัว ตั้งซ้ำได้)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/ws") {
      if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const userId = request.headers.get(ROOM_USER_HEADER);
      if (!userId) return new Response("missing user", { status: 400 });

      // เกิน cap → ปิด socket ที่เก่าที่สุดก่อน ให้เหลือที่ว่างหนึ่งที่
      // นับเฉพาะที่ยังเปิด (socket ที่เพิ่งสั่งปิดยังอยู่ใน getWebSockets() จนจบ close handshake)
      const open = this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
      if (open.length >= MAX_SOCKETS) {
        const byAge = open
          .map((ws) => ({ ws, at: attachmentOf(ws)?.at ?? 0 }))
          .sort((a, b) => a.at - b.at);
        for (const { ws } of byAge.slice(0, open.length - MAX_SOCKETS + 1)) {
          // บอกด้วยข้อความก่อน: close frame จาก server อาจไปไม่ถึง client บางตัว (เจอใน workerd local) — client ปิดเองเมื่อได้ "evicted"
          try {
            ws.send(EVICTED_MESSAGE);
          } catch {
            /* ปิดไปแล้ว */
          }
          safeClose(ws, CLOSE_TOO_MANY, "too many connections");
        }
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server, [userId]);
      server.serializeAttachment({ userId, at: Date.now() } satisfies Attachment);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (pathname === "/poke" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { type?: unknown } | null;
      const type: PokeType = body?.type === "room" ? "room" : "activity";
      const msg = JSON.stringify({ type });
      let sent = 0;
      for (const ws of this.ctx.getWebSockets()) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        try {
          ws.send(msg);
          sent++;
        } catch {
          /* socket ปิดระหว่างส่ง */
        }
      }
      return Response.json({ ok: true, sent });
    }

    return new Response("not found", { status: 404 });
  }

  /** client ไม่ต้องส่งอะไรนอกจาก "ping" (ตอบอัตโนมัติแล้ว) — ข้อความอื่นไม่สนใจ */
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {}

  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): Promise<void> {
    // ส่งรหัสเดิมกลับเฉพาะที่ close() รับได้ (1000, 3000–4999) · 1005/1006 ฯลฯ → 1000
    const c = code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000;
    safeClose(ws, c, reason.slice(0, 120));
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    safeClose(ws, 1011, "error");
  }
}
