/**
 * Worker entry: Worker เดียวรวม 3 บทบาท
 *  - /mcp                  → MCP server (ต้องมี OAuth access token)
 *  - /authorize, /token,
 *    /register, /.well-known/* → OAuth 2.1 authorization server (workers-oauth-provider)
 *  - ที่เหลือ               → เว็บแอป Next.js (vinext)
 */
import OAuthProvider, { type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import vinext from "vinext/server/fetch-handler";
import { getDb } from "./lib/db";
import { ensureMigrated } from "./lib/db/migrate";
import { runNotifications, type PushEnv } from "./lib/notify";
import { handleAuthorize, SCOPES } from "./lib/mcp/authorize";
import { buildMcpServer, type McpProps } from "./lib/mcp/server";

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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    await ensureMigrated(env.DB);
    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`.toLowerCase();
    return providerFor(origin).fetch(request, env, ctx);
  },

  /** cron ทุกนาที (ดู triggers ใน cloudflare.config.ts) */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    await ensureMigrated(env.DB);
    ctx.waitUntil(runNotifications(getDb(env.DB), env as unknown as PushEnv, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
