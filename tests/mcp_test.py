import base64, hashlib, json, os, secrets, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173"
REDIRECT = "http://localhost:9999/cb"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def http(method, path, body=None, headers=None, form=False):
    data = None
    h = dict(headers or {})
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode(); h["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        r = opener.open(req)
        return r.status, dict(r.headers), r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()

s, h, body = http("POST", "/mcp", {"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
print("unauth /mcp:", s, h.get("WWW-Authenticate") or h.get("Www-Authenticate"))
s, _, body = http("GET", "/.well-known/oauth-protected-resource/mcp"); print("PRM:", s, body[:200])
s, _, body = http("GET", "/.well-known/oauth-authorization-server"); print("ASM:", s, json.loads(body).get("registration_endpoint"))

s, _, body = http("POST", "/oauth/register", {"redirect_uris": [REDIRECT], "client_name": "Claude Test", "token_endpoint_auth_method": "none", "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"]})
client = json.loads(body); print("register:", s, client.get("client_id"))

verifier = secrets.token_urlsafe(48)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
q = urllib.parse.urlencode({"response_type": "code", "client_id": client["client_id"], "redirect_uri": REDIRECT, "scope": "couple offline_access", "state": "st123",
                            "code_challenge": challenge, "code_challenge_method": "S256", "resource": f"{BASE}/mcp"})
captured = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = b.new_context(storage_state="/tmp/duo-stateA.json", viewport={"width": 520, "height": 760})
    page = ctx.new_page()
    def on_cb(route):
        captured["url"] = route.request.url
        route.fulfill(status=200, body="ok")
    page.route("http://localhost:9999/**", on_cb)
    page.goto(f"{BASE}/authorize?{q}")
    page.screenshot(path="/tmp/duo-shots/consent.png")
    page.click("button[value=approve]")
    page.wait_for_timeout(1500)
    b.close()
cb = urllib.parse.urlparse(captured["url"]); params = dict(urllib.parse.parse_qsl(cb.query))
print("callback state:", params.get("state"), "has code:", "code" in params)

s, _, body = http("POST", "/oauth/token", {"grant_type": "authorization_code", "code": params["code"], "redirect_uri": REDIRECT, "client_id": client["client_id"],
                                            "code_verifier": verifier, "resource": f"{BASE}/mcp"}, form=True)
tok = json.loads(body); print("token:", s, tok.get("token_type"), tok.get("scope"), "refresh:", bool(tok.get("refresh_token")))
AUTH = {"Authorization": f"Bearer {tok['access_token']}", "Accept": "application/json, text/event-stream"}

def rpc(method, params=None, i=[0]):
    i[0] += 1
    s, h, body = http("POST", "/mcp", {"jsonrpc": "2.0", "id": i[0], "method": method, "params": params or {}}, AUTH)
    if body.startswith("event:") or "data:" in body[:20]:
        body = "\n".join(l[5:].strip() for l in body.splitlines() if l.startswith("data:"))
    try:
        return s, json.loads(body)
    except Exception:
        return s, body

s, init = rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}})
print("initialize:", s, str(init)[:160])
s, tl = rpc("tools/list")
print("tools:", s, [t["name"] for t in tl["result"]["tools"]] if isinstance(tl, dict) and "result" in tl else tl)

def call(name, args):
    s, r = rpc("tools/call", {"name": name, "arguments": args})
    res = r.get("result", r) if isinstance(r, dict) else r
    text = res["content"][0]["text"] if isinstance(res, dict) and "content" in res else str(res)
    print(f"\n== {name} ({s}) error={res.get('isError') if isinstance(res, dict) else '?'}\n{text[:500]}")
    return text

call("add_list_item", {"list": "ของที่ต้องซื้อ", "text": "ดอกไม้", "assignee": "partner"})
call("create_event", {"title": "ดูหนังด้วยกัน", "date": "2026-11-28", "time": "20:00"})
call("add_note", {"title": "จาก Claude", "body": "ทดสอบจดบันทึกผ่าน MCP"})
call("get_checkins", {"days": 2})
call("search_notes", {"query": "เซอร์ไพรส์"})  # private note of partner → must NOT appear
call("get_list", {"list": "ไม่มีจริง"})
call("get_summary", {})
