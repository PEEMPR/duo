/**
 * Worker entry: Worker เดียวรวม 3 บทบาท
 *  - /mcp                  → MCP server (ต้องมี OAuth access token)
 *  - /authorize, /token,
 *    /register, /.well-known/* → OAuth 2.1 authorization server (workers-oauth-provider)
 *  - /api/room/ws          → WebSocket ห้องของน้อง (Durable Object CoupleRoom ต่อคู่, ต้องมี session)
 *  - ที่เหลือ               → เว็บแอป Next.js (vinext)
 */
import OAuthProvider, { type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import vinext from "vinext/server/fetch-handler";
import { readCookie, SESSION_COOKIE, userFromToken } from "./lib/auth";
import { getDb } from "./lib/db";
import { ensureMigrated } from "./lib/db/migrate";
import { runNotifications, type PushEnv } from "./lib/notify";
import { handleAuthorize, SCOPES } from "./lib/mcp/authorize";
import { buildMcpServer, type McpProps } from "./lib/mcp/server";
import { ROOM_USER_HEADER } from "./lib/realtime/room-do";

// Durable Object class ต้อง export จาก entry module (ชื่อตรงกับ exports ใน cloudflare.config.ts)
export { CoupleRoom } from "./lib/realtime/room-do";

type WorkerEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

const web = vinext as unknown as ExportedHandler<Env> & { fetch: NonNullable<ExportedHandler<Env>["fetch"]> };

const mcpApi: ExportedHandler<Env> = {
  fetch(request, env, ctx) {
    const props = (ctx as ExecutionContext & { props: McpProps }).props;
    const handler = createMcpHandler(() => buildMcpServer(env, props), { route: "/mcp" });
    return handler(request, env, ctx);
  },
};

const defaultHandler: ExportedHandler<WorkerEnv> = {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/authorize") return handleAuthorize(request, env);
    return web.fetch(request as never, env, ctx);
  },
};

// resourceMetadata ต้องเป็น URL จริงของ deployment จึงสร้าง provider ตาม origin ของ request (cache ไว้)
const providers = new Map<string, OAuthProvider<Env>>();

function providerFor(origin: string) {
  let p = providers.get(origin);
  if (!p) {
    p = new OAuthProvider<Env>({
      apiRoute: "/mcp",
      apiHandler: mcpApi as never,
      defaultHandler: defaultHandler as never,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/oauth/token",
      clientRegistrationEndpoint: "/oauth/register",
      clientIdMetadataDocumentEnabled: true,
      scopesSupported: SCOPES,
      requiredScopes: ["couple"],
      refreshTokenIdleTTL: 60 * 60 * 24 * 60, // ใช้ต่อเนื่องได้ ถ้าไม่ได้ใช้เกิน 60 วันต้องเชื่อมใหม่
      resourceMetadata: {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        bearer_methods_supported: ["header"],
        resource_name: "Duo – พื้นที่ของคู่รัก",
      },
    });
    providers.set(origin, p);
  }
  return p;
}

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** WebSocket ที่เปิดแล้วปิดทันทีด้วย code/reason (ให้ client ได้รหัสปิดจริงแทน 1006) */
function closedSocket(code: number, reason: string): Response {
  const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

/**
 * GET /api/room/ws → WebSocket ของห้องคู่
 * ต้องจัดการก่อน OAuth provider / vinext (vinext upgrade WebSocket ไม่ได้)
 * coupleId มาจาก session เท่านั้น ไม่รับจาก client
 */
async function handleRoomSocket(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET") return new Response("method not allowed", { status: 405, headers: { allow: "GET" } });
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return text("expected websocket", 426);

  // กัน Cross-Site WebSocket Hijacking: browser ส่ง Origin เสมอ ต้องเป็น host เดียวกับที่รับ request
  const originHeader = request.headers.get("Origin");
  let originHost: string | null = null;
  try {
    const o = originHeader ? new URL(originHeader) : null;
    if (o && (o.protocol === "https:" || o.protocol === "http:")) originHost = o.host.toLowerCase();
  } catch {
    originHost = null;
  }
  if (!originHost || originHost !== url.host.toLowerCase()) return text("forbidden origin", 403);

  await ensureMigrated(env.DB);
  const user = await userFromToken(getDb(env.DB), readCookie(request.headers.get("Cookie"), SESSION_COOKIE));
  // ไม่มี session / ยังไม่มีคู่: รับ upgrade ใน Worker เอง (ไม่ปลุก DO) แล้วปิดทันทีด้วยรหัสที่ client รู้ว่าห้ามต่อใหม่
  // (ถ้าตอบ 401/403 ธรรมดา browser เห็นแค่ 1006 แล้ว client จะ retry ไม่รู้จบ)
  if (!user) return closedSocket(4401, "unauthorized");
  if (!user.coupleId) return closedSocket(4403, "no couple");

  // request ใหม่ทั้งก้อน: ไม่ส่ง cookie/header ของ client ต่อเข้า DO · userId ที่ตรวจแล้วไปทาง header ภายใน
  const stub = env.ROOM.get(env.ROOM.idFromName(user.coupleId));
  return stub.fetch("https://room/ws", { headers: { Upgrade: "websocket", [ROOM_USER_HEADER]: user.id } });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/api/room/ws") return handleRoomSocket(request, env, url);
    await ensureMigrated(env.DB);
    const origin = `${url.protocol}//${url.host}`.toLowerCase();
    return providerFor(origin).fetch(request, env, ctx);
  },

  /** cron ทุกนาที (ดู triggers ใน cloudflare.config.ts) */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    await ensureMigrated(env.DB);
    ctx.waitUntil(runNotifications(getDb(env.DB), env as unknown as PushEnv, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
