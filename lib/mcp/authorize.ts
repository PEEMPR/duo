import { AuthorizationError, CimdFetchError, type ConsentDescription, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { readCookie, SESSION_COOKIE, userFromToken } from "../auth";
import { getDb } from "../db";

export const SCOPES = ["couple", "offline_access"];

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string, headers = new Headers(), status = 200) {
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(
    `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600&display=swap" rel="stylesheet">
<style>
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#fdf7f7;color:#3a2a2d;font-family:"IBM Plex Sans Thai",system-ui,sans-serif;padding:20px}
.card{background:#fff;border:1px solid #f0e1e3;border-radius:16px;padding:28px;max-width:420px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,.04)}
h1{font-size:20px;margin:0 0 8px} p{color:#7a6366;line-height:1.6;margin:8px 0} .warn{background:#fff4e5;color:#8a5300;padding:10px 12px;border-radius:10px}
ul{padding-left:20px;color:#7a6366} .row{display:flex;gap:10px;margin-top:20px}
button,a.btn{flex:1;border:0;border-radius:10px;padding:11px;font:inherit;font-weight:600;cursor:pointer;text-align:center;text-decoration:none}
.primary{background:#e0607e;color:#fff}.ghost{background:#f6eced;color:#5a3d42}
</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers },
  );
}

/** /authorize — หน้ายินยอมให้ Claude (MCP client) เข้าถึงพื้นที่คู่ */
export async function handleAuthorize(request: Request, env: { DB: D1Database; OAUTH_PROVIDER: OAuthHelpers }): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const url = new URL(request.url);
  const user = await userFromToken(getDb(env.DB), readCookie(request.headers.get("cookie"), SESSION_COOKIE));

  try {
    if (request.method === "GET") {
      const authReq = await oauth.parseAuthRequest(request);
      if (!user) {
        return Response.redirect(`${url.origin}/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302);
      }
      if (!user.coupleId) {
        return page(
          "ยังไม่มีพื้นที่คู่",
          `<h1>ยังไม่มีพื้นที่คู่</h1><p>สร้างหรือเข้าร่วมพื้นที่คู่ก่อน แล้วกลับมากด Connect ใน Claude อีกครั้ง</p><div class="row"><a class="btn primary" href="/onboarding">ไปตั้งค่า</a></div>`,
        );
      }
      const details = await oauth.describeConsent(authReq);
      const consent = await oauth.beginConsent(authReq);
      return page("อนุญาตการเข้าถึง", consentBody(details, consent.handle, user.name), consent.headers);
    }

    if (request.method === "POST") {
      if (!user) return page("หมดเวลา", `<h1>เซสชันหมดอายุ</h1><p>กรุณาเริ่มเชื่อมต่อจาก Claude ใหม่อีกครั้ง</p>`, undefined, 401);
      const form = await request.formData();
      const handle = String(form.get("handle") ?? "");
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(request, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const requested = form.getAll("scope").map(String).filter((s) => SCOPES.includes(s));
      const scope = Array.from(new Set(["couple", ...requested]));
      const approved = await oauth.approveConsent(request, handle, { scope });
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: user.id,
        metadata: { email: user.email },
        scope,
        props: { userId: user.id },
      });
      approved.headers.set("Location", redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }

    return new Response("Method Not Allowed", { status: 405 });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
      const msg = error instanceof AuthorizationError ? error.description : "ไม่สามารถยืนยันแอปที่ขอเชื่อมต่อได้";
      return page("เกิดข้อผิดพลาด", `<h1>เชื่อมต่อไม่สำเร็จ</h1><p>${esc(String(msg ?? ""))}</p><p>ลองเริ่มเชื่อมต่อจาก Claude ใหม่อีกครั้ง</p>`, undefined, 400);
    }
    throw error;
  }
}

function consentBody(d: ConsentDescription, handle: string, userName: string) {
  const name = esc(d.clientName);
  const origin = d.clientDomain ? `เผยแพร่โดย <strong>${esc(d.clientDomain)}</strong>` : "แอปนี้ลงทะเบียนตัวเอง ชื่อแอปยังไม่ได้รับการยืนยัน";
  const scopes = d.scope.map((s) => `<input type="hidden" name="scope" value="${esc(s)}">`).join("");
  return `<h1>อนุญาตให้ ${name} เข้าถึงพื้นที่ของคุณ?</h1>
<p>${origin}<br>สิทธิ์จะถูกส่งไปที่ <strong>${esc(d.redirectHost)}</strong></p>
${d.redirectIsLoopback ? `<p class="warn">กำลังส่งสิทธิ์ไปยังแอปบนเครื่องคอมพิวเตอร์ ดำเนินการต่อเฉพาะเมื่อคุณเพิ่งกดเชื่อมต่อจากแอปนั้นเอง</p>` : ""}
<p>ในนามของ <strong>${esc(userName)}</strong> แอปนี้จะสามารถ:</p>
<ul><li>อ่านสรุป ปฏิทิน รายการ แผน และบันทึกที่คุณเห็นได้</li><li>เพิ่ม/แก้ไขนัด รายการ เช็กอิน แผน และบันทึก</li></ul>
<form method="post">
<input type="hidden" name="handle" value="${esc(handle)}">${scopes}
<div class="row"><button class="ghost" name="decision" value="deny">ปฏิเสธ</button><button class="primary" name="decision" value="approve">อนุญาต</button></div>
</form>`;
}
