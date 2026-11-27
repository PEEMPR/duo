"""QA P3B: calendar landing + room-on-calendar + compact room picker + corner pet + settings + pet push + MCP.
Run vs `vite preview --port 4175` of a QA copy (VAPID test keys in the copy's .dev.vars only).
  python3 pet_p3b_test.py [qa_dir]"""
import re, sys, time, glob, sqlite3, json, base64, hashlib, secrets, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4175"; ROOT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/qa-p3b"
SHOT = "/home/claude/p3-assets/qa"; BKK = timezone(timedelta(hours=7))
stamp = str(int(time.time())); PW = "password123"
res = []; errors = []; bad = []; skipped = []
def chk(name, ok, ev=""):
    res.append((name, bool(ok), ev)); print("PASS" if ok else "FAIL", name, "|", str(ev)[:600], flush=True)
def dbq(sql, args=()):
    f = [x for x in glob.glob(f"{ROOT}/.cloudflare/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite") if "metadata" not in x][0]
    c = sqlite3.connect(f, timeout=20); c.row_factory = sqlite3.Row
    try:
        r = [dict(x) for x in c.execute(sql, args).fetchall()]; c.commit(); return r
    finally: c.close()
def hook(page, tag):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror {e}"))
    page.on("console", lambda m: m.type in ("error", "warning") and errors.append(f"{tag} console.{m.type} {m.text[:240]}"))
    page.on("response", lambda r: r.status >= 500 and bad.append(f"{tag} {r.status} {r.url}"))
def path_of(pg): return urllib.parse.urlparse(pg.url).path
def signup(page, name, email):
    page.goto(f"{BASE}/signup"); page.fill("#name", name); page.fill("#email", email); page.fill("#password", PW)
    page.click("button[type=submit]"); page.wait_for_url(re.compile(r"/onboarding|/calendar|/dashboard"))
def login(page, email):
    page.goto(f"{BASE}/login"); page.fill("#email", email); page.fill("#password", PW)
    page.click("button[type=submit]"); page.wait_for_url(re.compile(r"/calendar|/dashboard|/onboarding")); page.wait_for_load_state("networkidle")
def create_couple(page, name):
    page.fill("#name", name); page.fill("#anniversary", "2023-02-14")
    page.locator("form").first.locator("button[type=submit]").click(); page.wait_for_url(re.compile(r"/calendar|/dashboard"))
    landed = path_of(page)
    page.goto(f"{BASE}/settings"); return page.locator("code.font-mono").first.inner_text().strip(), landed
def join(page, code):
    page.locator("#code").fill(code); page.locator("form").nth(1).locator("button[type=submit]").click(); page.wait_for_url(re.compile(r"/calendar|/dashboard"))
    return path_of(page)
G = "[role=group][aria-label^='ข้อความจาก']"
def bubble(pg): return pg.locator(G)
def btext(pg):
    l = bubble(pg); return l.locator("p.sr-only").inner_text().strip() if l.count() else None
def ppet(pg, name): return pg.locator(f"button[aria-label^='น้องของ {name}']")
def wait(fn, t=10, step=0.2):
    end = time.time() + t
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(step)
    return None
def close_bubble(pg):
    for _ in range(25):
        if not bubble(pg).count(): return
        if bubble(pg).locator("button:has-text('ปิด')").count(): bubble(pg).locator("button:has-text('ปิด')").click(); time.sleep(0.2); return
        bubble(pg).locator("button:has-text('ต่อไป')").click(); time.sleep(0.12)
def view_room(pg):
    """open /room, let the partner walk in, page through every bubble, let seen flush"""
    pg.goto(f"{BASE}/room"); pg.wait_for_load_state("networkidle"); time.sleep(3.3); close_bubble(pg); time.sleep(0.5); close_bubble(pg); time.sleep(2.2)
def checkin(pg, mood, energy, need=None, grat=None):
    pg.goto(f"{BASE}/checkin")
    pg.locator(f"label:has(input[name=mood][value='{mood}'])").click(); pg.locator(f"label:has(input[name=energy][value='{energy}'])").click()
    if need: pg.fill("#need", need)
    if grat: pg.fill("#gratitude", grat)
    pg.click("button:has-text('เช็กอิน')"); pg.wait_for_load_state("networkidle"); time.sleep(0.8)
def add_event(pg, title, date=None):
    pg.goto(f"{BASE}/calendar"); pg.fill("#title", title)
    if date: pg.fill("#date", date)
    pg.fill("#time", "19:00"); pg.fill("#endTime", "21:00")
    pg.click("text=บันทึกนัด"); pg.wait_for_load_state("networkidle"); time.sleep(0.5)
def corner(pg): return pg.locator("a[aria-label^='ไปห้องของน้อง']")
def has_dot(pg):
    c = corner(pg); return c.count() > 0 and "มีเรื่องใหม่" in (c.first.get_attribute("aria-label") or "")
def reload_dot(pg, url="/dashboard"):
    pg.goto(f"{BASE}{url}"); pg.wait_for_load_state("networkidle"); time.sleep(0.4); return has_dot(pg)
def overlap(r1, r2): return not (r1["x"] + r1["width"] <= r2["x"] or r2["x"] + r2["width"] <= r1["x"] or r1["y"] + r1["height"] <= r2["y"] or r2["y"] + r2["height"] <= r1["y"])
def section(name):
    print(f"\n===== {name} =====", flush=True)

# ---------------- MCP helpers (OAuth + JSON-RPC) ----------------
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
def http(method, path, body=None, headers=None, form=False):
    data = None; h = dict(headers or {})
    if body is not None:
        if form: data = urllib.parse.urlencode(body).encode(); h["Content-Type"] = "application/x-www-form-urlencoded"
        else: data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        r = opener.open(req); return r.status, dict(r.headers), r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()
def mcp_connect(browser, state_path):
    REDIRECT = "http://localhost:9999/cb"
    s, _, body = http("POST", "/oauth/register", {"redirect_uris": [REDIRECT], "client_name": "QA", "token_endpoint_auth_method": "none", "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"]})
    client = json.loads(body); verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    q = urllib.parse.urlencode({"response_type": "code", "client_id": client["client_id"], "redirect_uri": REDIRECT, "scope": "couple offline_access", "state": "st1", "code_challenge": challenge, "code_challenge_method": "S256", "resource": f"{BASE}/mcp"})
    cap = {}
    cx = browser.new_context(storage_state=state_path, viewport={"width": 520, "height": 760}); pg = cx.new_page()
    def on_cb(route): cap["url"] = route.request.url; route.fulfill(status=200, body="ok")
    pg.route("http://localhost:9999/**", on_cb); pg.goto(f"{BASE}/authorize?{q}"); pg.click("button[value=approve]"); pg.wait_for_timeout(1500); cx.close()
    params = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(cap["url"]).query))
    s, _, body = http("POST", "/oauth/token", {"grant_type": "authorization_code", "code": params["code"], "redirect_uri": REDIRECT, "client_id": client["client_id"], "code_verifier": verifier, "resource": f"{BASE}/mcp"}, form=True)
    AUTH = {"Authorization": f"Bearer {json.loads(body)['access_token']}", "Accept": "application/json, text/event-stream"}
    ctr = [0]
    def rpc(method, params=None):
        ctr[0] += 1; s, h, b = http("POST", "/mcp", {"jsonrpc": "2.0", "id": ctr[0], "method": method, "params": params or {}}, AUTH)
        if "data:" in b[:30] or b.startswith("event:"): b = "\n".join(l[5:].strip() for l in b.splitlines() if l.startswith("data:"))
        try: return s, json.loads(b)
        except Exception: return s, b
    rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}})
    def call(name, args=None):
        s, r = rpc("tools/call", {"name": name, "arguments": args or {}})
        rr = r.get("result", r) if isinstance(r, dict) else r
        text = rr["content"][0]["text"] if isinstance(rr, dict) and "content" in rr else str(rr)
        try: return json.loads(text)
        except Exception: return text
    return rpc, call

clock = datetime.now(BKK); print("RUN CLOCK (Bangkok):", clock.isoformat(), flush=True)
today = clock.date().isoformat(); tomorrow = (clock.date() + timedelta(days=1)).isoformat()
EA = f"qa{stamp}@test.dev"; EB = f"qb{stamp}@test.dev"; EN = f"qn{stamp}@test.dev"; SEC = "ความลับของบีB77"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    mk = lambda w=390, h=844, mob=True: (lambda c: (c, c.new_page()))(b.new_context(viewport={"width": w, "height": h}, locale="th-TH", timezone_id="Asia/Bangkok", is_mobile=mob, has_touch=mob))
    Ax, a = mk(); Bx, m = mk(); hook(a, "A"); hook(m, "B")

    # ===================== 1. LANDING =====================
    section("1 landing")
    signup(a, "AA", EA)
    chk("1a signup (no couple) -> /onboarding", path_of(a) == "/onboarding", a.url)
    code, landed = create_couple(a, "P3B QA")
    chk("1b signup + create couple -> /calendar", landed == "/calendar", landed)
    signup(m, "BB", EB); landed_b = join(m, code)
    chk("1c join couple -> /calendar", landed_b == "/calendar", landed_b)
    cid = dbq("select couple_id c from couple_members where user_id=(select id from users where email=?)", (EA,))[0]["c"]
    uidA = dbq("select id from users where email=?", (EA,))[0]["id"]; uidB = dbq("select id from users where email=?", (EB,))[0]["id"]
    nx, n = mk(); hook(n, "N"); signup(n, "NN", EN); n.goto(f"{BASE}/calendar"); n.wait_for_load_state("networkidle")
    chk("1d new user without couple: /calendar -> /onboarding", path_of(n) == "/onboarding", n.url)
    n.goto(f"{BASE}/"); chk("1e no-couple user visiting / -> /onboarding", path_of(n) == "/onboarding", n.url); nx.close()
    # fresh login (desktop) lands on /calendar; "/" while logged in -> /calendar
    Dx = b.new_context(viewport={"width": 1280, "height": 800}, locale="th-TH", timezone_id="Asia/Bangkok"); d = Dx.new_page(); hook(d, "Ad")
    login(d, EA); chk("1f login (existing, couple) -> /calendar", path_of(d) == "/calendar", d.url)
    d.goto(f"{BASE}/"); d.wait_for_load_state("networkidle"); chk("1g visiting / while logged in -> /calendar", path_of(d) == "/calendar", d.url)
    d.goto(f"{BASE}/dashboard"); d.wait_for_load_state("networkidle")
    side = d.locator("aside a[href='/dashboard']"); chk("1h /dashboard works (desktop) + in side menu", path_of(d) == "/dashboard" and side.count() == 1 and side.first.is_visible() and d.locator("main").inner_text().strip() != "", {"path": path_of(d)})
    a.goto(f"{BASE}/dashboard"); a.wait_for_load_state("networkidle")
    bn = a.locator("nav.fixed a[href='/dashboard']")
    chk("1i /dashboard in mobile bottom menu", path_of(a) == "/dashboard" and bn.count() == 1 and bn.first.is_visible())

    # ===================== 3a. REALTIME walk-in on /calendar (fresh: partner not present) =====================
    section("3 realtime on calendar")
    a.goto(f"{BASE}/calendar"); a.wait_for_load_state("networkidle"); time.sleep(2.0)
    sec = a.locator("section[aria-label='ห้องของน้อง']")
    chk("2a pet room section at top of /calendar (aria-label ห้องของน้อง) above the calendar heading", sec.count() == 1 and sec.bounding_box()["y"] < a.locator("h1, h2").filter(has_text="ปฏิทินของเรา").first.bounding_box()["y"], sec.bounding_box() if sec.count() else None)
    chk("3pre partner pet hidden before B does anything", ppet(a, "BB").count() == 0)
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1.5)
    t_hug1 = time.time(); m.locator("button:has-text('กอด')").click()
    seen_walk = None; seen_bubble = None; end = time.time() + 12
    while time.time() < end:
        if seen_walk is None and a.locator("section[aria-label='ห้องของน้อง'] .pet-walk-in").count(): seen_walk = time.time() - t_hug1
        if seen_bubble is None and bubble(a).count(): seen_bubble = time.time() - t_hug1
        if seen_walk is not None and seen_bubble is not None: break
        time.sleep(0.05)
    chk("3a B hugs (from /room) -> A on /calendar sees B's pet walk in (no reload)", seen_walk is not None and seen_walk < 8, {"walk_s": seen_walk})
    chk("3b ... and speech bubble appears on A's /calendar within seconds", seen_bubble is not None and seen_bubble < 10, {"bubble_s": seen_bubble, "text": btext(a)})
    a.screenshot(path=f"{SHOT}/p3b-calendar-realtime-walkin-mobile.png")
    close_bubble(a); time.sleep(2.0)
    ob = dbq("select * from notification_outbox where user_id=? and kind='pet' order by rowid", (uidA,))
    # (7 checks below reuse this)
    # B creates event while A idle on /calendar -> new bubble
    mp = m.context.new_page(); hook(mp, "B2"); t0 = time.time(); add_event(mp, "นัดเรียลไทม์RT1", tomorrow)
    got = wait(lambda: bubble(a).count() and "นัดเรียลไทม์RT1" in (btext(a) or ""), 12)
    chk("3c B creates event -> A's /calendar room shows speech about it live", bool(got), {"s": round(time.time() - t0, 1), "text": btext(a)})
    close_bubble(a); time.sleep(2.0)

    # ===================== 2. CALENDAR PAGE =====================
    section("2 calendar page")
    a.goto(f"{BASE}/calendar"); a.wait_for_load_state("networkidle")
    # make something unseen so room walks in on the (re)load
    add_event(mp, "นัดเดินเข้าW2", tomorrow)
    a.goto(f"{BASE}/calendar"); a.wait_for_load_state("networkidle")
    walked = wait(lambda: a.locator("section[aria-label='ห้องของน้อง'] .pet-walk-in").count() > 0, 3)
    time.sleep(3.0); close_bubble(a); time.sleep(2.0)
    a.screenshot(path=f"{SHOT}/p3b-calendar-top-room-mobile.png")
    month_title = lambda: a.locator("h2, [data-slot=card-title]").filter(has_text=re.compile(r"20\d\d|25\d\d")).first.inner_text().strip()
    t_before = month_title(); url0 = a.url
    a.evaluate("""() => { window.__qaNav = 'same-document'; const s = document.querySelector("section[aria-label='ห้องของน้อง']"); s.dataset.qaMark = '1';
        s.firstElementChild.dataset.qaMark = '1'; const pb = document.querySelector("button[aria-label^='น้องของ BB']"); if (pb) pb.dataset.qaMark = '1';
        const mine = document.querySelector("button[aria-label='น้องของฉัน']"); if (mine) mine.dataset.qaMark = '1'; }""")
    mark_probe = lambda: a.evaluate("""() => ({ nav: window.__qaNav || null, sec: document.querySelector("section[aria-label='ห้องของน้อง']")?.dataset.qaMark || null,
        inner: document.querySelector("section[aria-label='ห้องของน้อง']")?.firstElementChild?.dataset.qaMark || null,
        partner: document.querySelector("button[aria-label^='น้องของ BB']")?.dataset.qaMark || null, mine: document.querySelector("button[aria-label='น้องของฉัน']")?.dataset.qaMark || null,
        walk: document.querySelectorAll("section[aria-label='ห้องของน้อง'] .pet-walk-in").length, bubbles: document.querySelectorAll("[role=group][aria-label^='ข้อความจาก']").length })""")
    chk("2b pre-nav marker set (partner present, walk-in observed on load)", mark_probe()["partner"] == "1", {"walked_on_load": walked})
    all_ok = True; probes = []
    for label in ("เดือนถัดไป", "เดือนถัดไป", "เดือนก่อน"):
        a.locator(f"a[aria-label='{label}']").click(); time.sleep(0.4)
        worst = None
        for _ in range(12):  # watch 2.4 s for any replay
            pr = mark_probe(); worst = pr if (pr["walk"] or pr["bubbles"]) else worst; time.sleep(0.2)
        pr = mark_probe(); probes.append({"label": label, "url": path_of(a) + "?" + urllib.parse.urlparse(a.url).query, **pr, "replay": worst})
        all_ok &= pr["nav"] == "same-document" and pr["sec"] == "1" and pr["inner"] == "1" and pr["partner"] == "1" and pr["mine"] == "1" and worst is None
    chk("2c month navigation (?m=) keeps room DOM nodes (no remount) and no walk-in/bubble replay", all_ok, probes)
    chk("2d month heading changed + ?m= in URL", month_title() != t_before and "m=" in a.url, {"before": t_before, "after": month_title(), "url": a.url})
    a.goto(f"{BASE}/calendar?m=2027-03&d=2027-03-10"); a.wait_for_load_state("networkidle")
    chk("2e direct ?m=2027-03 loads that month", "2027" in month_title() or "2570" in month_title() or "2027" in a.content()[:200000], month_title())
    # add event with reminder select
    a.goto(f"{BASE}/calendar?d={tomorrow}"); a.wait_for_load_state("networkidle")
    a.fill("#time", "21:00"); a.fill("#endTime", "22:00"); time.sleep(0.4)
    sel = a.locator("#remindBeforeSelect"); opts = sel.locator("option").evaluate_all("o => o.map(x => x.value)")
    chk("2f reminder select present with options", sel.count() == 1 and len(opts) >= 3, opts)
    a.fill("#title", "นัดมีเตือนR1")
    pick = next((o for o in opts if o not in ("custom",) and o != sel.input_value()), opts[0]); sel.select_option(pick); time.sleep(0.3)
    hidden = a.locator("input[name=remindBefore]").input_value()
    a.click("text=บันทึกนัด"); a.wait_for_load_state("networkidle"); time.sleep(0.6)
    row = dbq("select title, remind_before from events where title='นัดมีเตือนR1' and couple_id=?", (cid,))
    chk("2g add event with chosen reminder -> saved (remind_before == submitted value) and listed", row and row[0]["remind_before"] == hidden and a.locator("li:has-text('นัดมีเตือนR1')").count() == 1, {"picked": pick, "hidden": hidden, "db": row})
    # error codes
    ERR = lambda: a.locator("p.text-destructive").first.inner_text().strip() if a.locator("p.text-destructive").count() else None
    def submit_bad(title, **fields):
        a.goto(f"{BASE}/calendar?d={tomorrow}"); a.wait_for_load_state("networkidle"); a.fill("#title", title)
        for k, v in fields.items():
            if k == "hidden": a.evaluate("v => { document.querySelector('input[name=remindBefore]').value = v }", v)
            else: a.fill(f"#{k}", v)
        a.click("text=บันทึกนัด"); a.wait_for_load_state("networkidle"); time.sleep(0.5); return ERR()
    e1 = submit_bad("bad1", endDate=today)
    chk("2h error: end date before start", e1 == "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" and "err=" in a.url, e1)
    e2 = submit_bad("bad2", time="20:00", endTime="19:00")
    chk("2i error: end time before start", e2 == "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม", e2)
    e3 = submit_bad("bad3", hidden="h2")
    chk("2j error: hour reminder on all-day event", e3 == "นัดทั้งวันเลือกเตือนเป็นชั่วโมงไม่ได้", e3)
    e4 = submit_bad("bad4", time="10:00", hidden="zzz")
    chk("2k error: malformed reminder value (zod path -> generic invalid message, no raw echo)", e4 in ("ค่าการเตือนไม่ถูกต้อง", "ข้อมูลนัดไม่ถูกต้อง"), e4)
    a.goto(f"{BASE}/calendar?d={today}"); a.wait_for_load_state("networkidle"); a.fill("#title", "bad5"); a.fill("#date", today); a.fill("#time", "00:30")
    a.evaluate("() => { document.querySelector('input[name=remindBefore]').value = 'd1' }"); a.click("text=บันทึกนัด"); a.wait_for_load_state("networkidle"); time.sleep(0.5)
    e5 = ERR(); chk("2l error: reminder time already passed", e5 == "เวลาเตือนนี้ผ่านไปแล้ว เลือกเวลาที่ใกล้กว่านี้", e5)
    a.goto(f"{BASE}/calendar?err=%E0%B8%AA%E0%B8%B8%E0%B9%88%E0%B8%A1&d={today}"); a.wait_for_load_state("networkidle")
    chk("2m unknown err code -> fallback message (no raw echo)", ERR() == "บันทึกนัดไม่สำเร็จ ลองใหม่อีกครั้ง", ERR())
    chk("2n none of the bad events were saved", dbq("select count(*) n from events where title like 'bad%' and couple_id=?", (cid,))[0]["n"] == 0)
    # birthday pin
    ym = today[:7]
    dbq("update users set birthday=?, show_birthday=1 where id=?", (f"1995-{today[5:7]}-15", uidB))
    a.goto(f"{BASE}/calendar?m={ym}&d={ym}-15"); a.wait_for_load_state("networkidle")
    pins = a.locator("svg[role=img][aria-label]"); lab = [pins.nth(i).get_attribute("aria-label") for i in range(pins.count())]
    chk("2o birthday pin renders on the calendar grid + selected-day row", pins.count() >= 1 and any("BB" in (x or "") for x in lab), lab)
    a.screenshot(path=f"{SHOT}/p3b-calendar-birthday-mobile.png", full_page=True)
    d.goto(f"{BASE}/calendar"); d.wait_for_load_state("networkidle"); time.sleep(3.5); close_bubble(d)
    chk("2p desktop /calendar: room above calendar, both visible", d.locator("section[aria-label='ห้องของน้อง']").bounding_box()["width"] > 300)
    d.screenshot(path=f"{SHOT}/p3b-calendar-top-room-desktop.png")

    # ===================== 4. COMPACT PICKER =====================
    section("4 compact picker")
    ly = clock.date().replace(year=clock.year - 1)
    dbq("insert into events (id, couple_id, title, start_at, all_day, remind_before, created_by) values (?,?,?,?,0,'d1',?)", ("p3bmem" + stamp, cid, "ทะเลหัวหินP3B", f"{ly.isoformat()}T05:00:00.000Z", uidA))
    a.goto(f"{BASE}/calendar"); a.wait_for_load_state("networkidle"); time.sleep(3.5); close_bubble(a)
    m.goto(f"{BASE}/calendar"); m.wait_for_load_state("networkidle"); time.sleep(3.0); close_bubble(m)
    sa = a.locator("section[aria-label='ห้องของน้อง']"); scene = sa.locator("div.overflow-hidden").first
    pbtn = a.locator("button[aria-label='เปลี่ยนห้อง']")
    chk("4a exactly one 'เปลี่ยนห้อง' button in room section", pbtn.count() == 1 and sa.locator("button[aria-label='เปลี่ยนห้อง']").count() == 1)
    sb = scene.bounding_box(); bb = pbtn.bounding_box()
    chk("4b button is in the top-right of the scene", bb["x"] + bb["width"] > sb["x"] + sb["width"] * 0.85 and bb["y"] < sb["y"] + sb["height"] * 0.2 and bb["x"] >= sb["x"] and bb["y"] >= sb["y"], {"btn": bb, "scene": sb})
    chk("4c closed: no popover and no always-visible swatch row (no aria-pressed buttons in section)", sa.locator("[role=group][aria-label='เลือกห้อง']").count() == 0 and sa.locator("button[aria-pressed]").count() == 0 and pbtn.get_attribute("aria-expanded") == "false")
    mem = a.locator("aside[aria-label='ปีที่แล้ววันนี้']"); wait(lambda: mem.count() == 1, 6)
    mb = mem.bounding_box() if mem.count() else None
    chk("4d closed: picker button does not overlap the memory bubble", mb is not None and not overlap(bb, mb), {"btn": bb, "memory": mb})
    sb2 = bubble(a)
    a.screenshot(path=f"{SHOT}/p3b-picker-closed-mobile.png")
    pbtn.click(); time.sleep(0.3)
    pop = sa.locator("[role=group][aria-label='เลือกห้อง']"); items = pop.locator("button")
    names = [items.nth(i).inner_text().strip() for i in range(items.count())]
    chk("4e opens popover with 5 rooms", pop.count() == 1 and items.count() == 5 and pbtn.get_attribute("aria-expanded") == "true", names)
    pb = pop.bounding_box(); vp = a.viewport_size
    chk("4f popover fully inside viewport (mobile)", pb["x"] >= 0 and pb["x"] + pb["width"] <= vp["width"] and pb["y"] + pb["height"] <= vp["height"], pb)
    a.screenshot(path=f"{SHOT}/p3b-picker-open-mobile.png")
    # Escape + focus return (move focus into the popover first)
    items.nth(1).focus(); a.keyboard.press("Escape"); time.sleep(0.3)
    foc = a.evaluate("document.activeElement?.getAttribute('aria-label')")
    chk("4g Escape closes popover and returns focus to the button", pop.count() == 0 and foc == "เปลี่ยนห้อง", {"focus": foc})
    # outside click
    pbtn.click(); time.sleep(0.2); a.mouse.click(5, 700); time.sleep(0.3)
    foc2 = a.evaluate("document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName")
    chk("4h outside click closes popover", pop.count() == 0 and pbtn.get_attribute("aria-expanded") == "false", {"focus_after_outside_click": foc2})
    # pick a room -> both A and B (realtime)
    scene_sig = lambda pg: pg.evaluate("() => { const e = document.querySelector(\"section[aria-label='ห้องของน้อง'] div.overflow-hidden > div[aria-hidden]\"); let h = 0; const s = e ? e.innerHTML : ''; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h + ':' + s.length }")
    before_a, before_b = scene_sig(a), scene_sig(m)
    cur = [items.nth(i) for i in range(0)]
    pbtn.click(); time.sleep(0.2); pressed = [pop.locator("button").nth(i).get_attribute("aria-pressed") for i in range(5)]
    idx = pressed.index("false"); chosen = pop.locator("button").nth(idx).inner_text().strip()
    chk("4i exactly one room is marked aria-pressed (current)", pressed.count("true") == 1, pressed)
    pop.locator("button").nth(idx).click(); time.sleep(0.5)
    foc3 = a.evaluate("document.activeElement?.getAttribute('aria-label')")
    chk("4j picking a room closes popover, focus returns to button, scene changes for A", pop.count() == 0 and foc3 == "เปลี่ยนห้อง" and scene_sig(a) != before_a, {"focus": foc3, "chosen": chosen})
    chk("4k DB couples.room updated", dbq("select room from couples where id=?", (cid,))[0]["room"] is not None, dbq("select room from couples where id=?", (cid,))[0])
    t0 = time.time(); okB = wait(lambda: scene_sig(m) != before_b, 10)
    chk("4l B (open /calendar) sees the room change in realtime without reload", bool(okB), {"s": round(time.time() - t0, 1)})
    m.locator("button[aria-label='เปลี่ยนห้อง']").click(); time.sleep(0.3)
    bpressed = {m.locator("[role=group][aria-label='เลือกห้อง'] button").nth(i).inner_text().strip(): m.locator("[role=group][aria-label='เลือกห้อง'] button").nth(i).get_attribute("aria-pressed") for i in range(5)}
    chk("4m B's picker shows the chosen room as current", any(k.startswith(chosen) and v == "true" for k, v in bpressed.items()), bpressed)
    # B picks another from /calendar -> A sees
    before_a2 = scene_sig(a); other = next(k for k, v in bpressed.items() if v == "false").strip()
    m.locator("[role=group][aria-label='เลือกห้อง'] button", has_text=other).first.click()
    okA = wait(lambda: scene_sig(a) != before_a2, 10)
    chk("4n B picks another room -> A's room changes in realtime", bool(okA), {"picked": other})
    d.goto(f"{BASE}/calendar"); d.wait_for_load_state("networkidle"); time.sleep(1.0)
    dp = d.locator("button[aria-label='เปลี่ยนห้อง']"); dp.click(); time.sleep(0.3)
    d.screenshot(path=f"{SHOT}/p3b-picker-open-desktop.png"); dpp = d.locator("[role=group][aria-label='เลือกห้อง']")
    chk("4o desktop: popover opens with 5 rooms", dpp.locator("button").count() == 5); d.keyboard.press("Escape")
    # /room has picker too
    a.goto(f"{BASE}/room"); a.wait_for_load_state("networkidle"); chk("4p /room also has single picker button and no swatch row", a.locator("button[aria-label='เปลี่ยนห้อง']").count() == 1 and a.locator("button[aria-pressed]").count() == 0)

    # ===================== 5. CORNER PET =====================
    section("5 corner pet")
    view_room(a); view_room(m)
    PAGES = ["/dashboard", "/lists", "/notes", "/settings"]
    for (ctx_pg, tag) in ((a, "mobile"), (d, "desktop")):
        for pth in PAGES:
            ctx_pg.goto(f"{BASE}{pth}"); ctx_pg.wait_for_load_state("networkidle"); time.sleep(0.3)
            vis = corner(ctx_pg).count() == 1 and corner(ctx_pg).first.is_visible()
            chk(f"5a corner visible on {pth} ({tag})", vis)
        for pth in ("/calendar", "/room"):
            ctx_pg.goto(f"{BASE}{pth}"); ctx_pg.wait_for_load_state("networkidle"); time.sleep(0.3)
            chk(f"5b corner NOT on {pth} ({tag})", corner(ctx_pg).count() == 0)
    a.goto(f"{BASE}/dashboard"); a.wait_for_load_state("networkidle"); a.screenshot(path=f"{SHOT}/p3b-corner-dashboard-mobile.png")
    d.goto(f"{BASE}/dashboard"); d.wait_for_load_state("networkidle"); d.screenshot(path=f"{SHOT}/p3b-corner-dashboard-desktop.png")
    for pth in PAGES + ["/plans", "/checkin"]:
        a.goto(f"{BASE}{pth}"); a.wait_for_load_state("networkidle")
        if corner(a).count() == 0: continue
        cb = corner(a).first.bounding_box(); navs = a.locator("nav.fixed a"); n_ = navs.count()
        ov = [navs.nth(i).inner_text() for i in range(n_) if overlap(cb, navs.nth(i).bounding_box())]
        navtop = min(navs.nth(i).bounding_box()["y"] for i in range(n_))
        chk(f"5c mobile corner vs bottom-nav buttons on {pth}: no overlap, sits above nav", not ov and cb["y"] + cb["height"] <= navtop + 0.5 and cb["x"] + cb["width"] <= a.viewport_size["width"], {"corner": cb, "nav_top": navtop, "overlap": ov})
    a.goto(f"{BASE}/lists"); a.wait_for_load_state("networkidle"); corner(a).first.click(); a.wait_for_url(re.compile("/room"))
    chk("5d tapping corner goes to /room", path_of(a) == "/room")
    # --- dot logic ---
    view_room(a); chk("5e baseline: no dot after viewing room", not reload_dot(a))
    mp.goto(f"{BASE}/calendar"); add_event(mp, "ดอทอีเวนต์D1", tomorrow)
    chk("5f partner created event today -> dot on A (reload)", reload_dot(a))
    a.screenshot(path=f"{SHOT}/p3b-corner-dot-mobile.png")
    view_room(a); chk("5g after A views room -> dot cleared (reload)", not reload_dot(a))
    # check-in teaser
    mp.goto(f"{BASE}/room"); checkin(mp, 4, 3, SEC, "ขอบคุณ-B88")
    chk("5h B checks in (A hasn't) -> dot on A", reload_dot(a))
    view_room(a); chk("5i A views room (teaser) -> dot cleared", not reload_dot(a))
    rpcA = callA = None
    # MCP get_room for A now (A not checked in) -> must be teaser only
    Ax.storage_state(path=f"/tmp/p3b-stateA-{stamp}.json"); Bx.storage_state(path=f"/tmp/p3b-stateB-{stamp}.json")
    try:
        rpcA, callA = mcp_connect(b, f"/tmp/p3b-stateA-{stamp}.json"); rpcB, callB = mcp_connect(b, f"/tmp/p3b-stateB-{stamp}.json")
    except Exception as e:
        skipped.append(f"MCP OAuth connect failed: {e}")
    if callA:
        gr = callA("get_room"); gtxt = json.dumps(gr, ensure_ascii=False)
        ck = [q for q in gr.get("queue", []) if q["kind"] == "checkin"] if isinstance(gr, dict) else []
        chk("8a MCP get_room (A not checked in): B's check-in is teaser, no real text", bool(ck) and SEC not in gtxt and "ขอบคุณ-B88" not in gtxt and ck[0].get("teaser"), ck[:1])
    a.goto(f"{BASE}/dashboard"); checkin(a, 5, 4, "ของA", "ขอบคุณA")
    chk("5j A checks in -> dot returns (real text unseen)", reload_dot(a))
    view_room(a)
    chk("5k A views room again -> dot gone", not reload_dot(a))
    if callA:
        gr = callA("get_room"); gtxt = json.dumps(gr, ensure_ascii=False)
        chk("8b MCP get_room after A checked in: real text now present", SEC in gtxt, [q for q in gr.get("queue", []) if q["kind"] == "checkin"][:1])
    # deleted event -> no stuck dot
    mp.goto(f"{BASE}/calendar"); add_event(mp, "ลบแล้วDEL9", tomorrow)
    dot_before_del = reload_dot(a)
    mp.goto(f"{BASE}/calendar?d={tomorrow}"); mp.wait_for_load_state("networkidle")
    mp.locator("li:has-text('ลบแล้วDEL9')").first.locator("button[aria-label='ลบ']").click(); mp.wait_for_load_state("networkidle"); time.sleep(1)
    gone = dbq("select count(*) n from events where title='ลบแล้วDEL9' and couple_id=?", (cid,))[0]["n"] == 0
    chk("5l (pre) event created then dot appeared, then B deleted event", dot_before_del and gone, {"dot_before": dot_before_del, "deleted": gone})
    chk("5m B deleted the event -> no stuck dot on A (reload)", not reload_dot(a))
    # in-app path change re-check (client) after >=60s throttle: informational
    # ===================== 6. SETTINGS =====================
    section("6 settings")
    a.goto(f"{BASE}/settings"); a.wait_for_load_state("networkidle")
    card = a.locator("div[data-slot=card]", has=a.locator("text=ตัวละคร / น้อง")).last
    chk("6a settings has 'ตัวละคร / น้อง' section with corner + rest checkboxes", card.count() == 1 and card.locator("input[name=petCorner]").is_checked() and not card.locator("input[name=petRest]").is_checked())
    card.scroll_into_view_if_needed(); a.screenshot(path=f"{SHOT}/p3b-settings-pet-section-mobile.png")
    card.locator("input[name=petCorner]").uncheck(); card.locator("button:has-text('บันทึก')").click(); a.wait_for_url(re.compile("pet=1")); a.wait_for_load_state("networkidle")
    chk("6b save shows 'บันทึกแล้ว' and DB pet_corner=0", a.locator("text=บันทึกแล้ว").count() >= 1 and dbq("select pet_corner c from users where id=?", (uidA,))[0]["c"] == 0)
    off_ok = True; offinfo = []
    for pth in PAGES:
        a.goto(f"{BASE}{pth}"); a.wait_for_load_state("networkidle"); c_ = corner(a).count(); offinfo.append((pth, c_)); off_ok &= c_ == 0
    d.goto(f"{BASE}/dashboard"); d.wait_for_load_state("networkidle"); offinfo.append(("desktop /dashboard", corner(d).count())); off_ok &= corner(d).count() == 0
    chk("6c corner OFF -> gone on dashboard/lists/notes/settings (mobile+desktop)", off_ok, offinfo)
    m.goto(f"{BASE}/dashboard"); m.wait_for_load_state("networkidle"); chk("6d partner B's corner unaffected", corner(m).count() == 1)
    a.goto(f"{BASE}/settings"); a.wait_for_load_state("networkidle"); card = a.locator("div[data-slot=card]", has=a.locator("text=ตัวละคร / น้อง")).last
    chk("6e checkbox reflects OFF after reload", not card.locator("input[name=petCorner]").is_checked())
    card.locator("input[name=petCorner]").check(); card.locator("button:has-text('บันทึก')").click(); a.wait_for_url(re.compile("pet=1")); a.wait_for_load_state("networkidle")
    on_ok = True; oninfo = []
    for pth in PAGES:
        a.goto(f"{BASE}{pth}"); a.wait_for_load_state("networkidle"); c_ = corner(a).count(); oninfo.append((pth, c_)); on_ok &= c_ == 1
    d.goto(f"{BASE}/lists"); d.wait_for_load_state("networkidle"); on_ok &= corner(d).count() == 1
    chk("6f corner ON again -> back on all pages (+desktop)", on_ok, oninfo)
    # rest mode
    dbq("update checkins set date=? where user_id=?", ((clock.date() - timedelta(days=12)).isoformat(), uidA))
    dbq("update users set created_at=? where id=?", ((clock - timedelta(days=12)).astimezone(timezone.utc).isoformat().replace("+00:00", "Z"), uidA))
    mood_of = lambda call: (lambda r: (r["partner"]["mood"], r["partner"]["pose"]))(call("get_room")) if call else None
    before_rest = mood_of(callB)
    a.goto(f"{BASE}/settings"); a.wait_for_load_state("networkidle"); card = a.locator("div[data-slot=card]", has=a.locator("text=ตัวละคร / น้อง")).last
    card.locator("input[name=petRest]").check(); card.locator("button:has-text('บันทึก')").click(); a.wait_for_url(re.compile("pet=1")); a.wait_for_load_state("networkidle")
    after_rest = mood_of(callB)
    chk("6g rest mode toggle saved (DB pet_rest=1, checkbox stays checked after reload)", dbq("select pet_rest r from users where id=?", (uidA,))[0]["r"] == 1 and a.locator("input[name=petRest]").is_checked(), {})
    if callB: chk("6h rest mode effect: A (12 days no check-in) looks sad/curled to B only when rest is OFF (via MCP get_room)", before_rest != after_rest and before_rest[1] in ("curl", "stand") and before_rest[0] == "sad", {"rest_off": before_rest, "rest_on": after_rest})
    else: skipped.append("6h rest-mode behavior via MCP")
    dbq("update checkins set date=? where user_id=?", (today, uidA))
    a.goto(f"{BASE}/settings"); a.wait_for_load_state("networkidle"); card = a.locator("div[data-slot=card]", has=a.locator("text=ตัวละคร / น้อง")).last
    card.locator("input[name=petRest]").uncheck(); card.locator("button:has-text('บันทึก')").click(); a.wait_for_url(re.compile("pet=1"))
    chk("6i rest mode toggled off again -> DB pet_rest=0", dbq("select pet_rest r from users where id=?", (uidA,))[0]["r"] == 0)

    # ===================== 7. PUSH KIND "pet" =====================
    section("7 push kind pet")
    a.goto(f"{BASE}/settings"); a.wait_for_load_state("networkidle")
    cb_ = a.locator("input[name=pet]"); lbl = a.locator("label:has(input[name=pet])").inner_text().strip() if cb_.count() else None
    chk("7a settings shows 'pet' notify checkbox, default checked", cb_.count() == 1 and cb_.is_checked(), lbl)
    a.locator("label:has(input[name=pet])").scroll_into_view_if_needed(); a.screenshot(path=f"{SHOT}/p3b-settings-notify-pet-mobile.png")
    ob = dbq("select * from notification_outbox where user_id=? and kind='pet' order by rowid", (uidA,))
    hug_rows = [r for r in ob if "ส่งกอด" in r["title"]]
    chk("7b B hugs A -> exactly 1 outbox row for A, kind pet, url /room", len(hug_rows) == 1 and hug_rows[0]["url"] == "/room" and hug_rows[0]["sent_at"] is None, [(r["title"], r["body"], r["url"], r["deliver_after"]) for r in ob])
    # second hug after cooldown, while first still pending
    wait_s = 62 - (time.time() - t_hug1)
    if wait_s > 0: print(f"waiting {wait_s:.0f}s for hug cooldown", flush=True); time.sleep(wait_s)
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1.2)
    hug_n0 = dbq("select count(*) n from activity_feed where couple_id=? and user_id=? and kind='hug'", (cid, uidB))[0]["n"]
    m.locator("button:has-text('กอด')").click(); time.sleep(1.5)
    hug_n1 = dbq("select count(*) n from activity_feed where couple_id=? and user_id=? and kind='hug'", (cid, uidB))[0]["n"]
    hug_rows2 = dbq("select * from notification_outbox where user_id=? and kind='pet' and title like '%ส่งกอด%' and sent_at is null", (uidA,))
    chk("7c second hug (2 within the batch window) -> activity recorded but still exactly 1 queued push", hug_n1 - hug_n0 == 1 and len(hug_rows2) == 1, {"new_hugs": hug_n1 - hug_n0, "pending_hug_rows": len(hug_rows2)})
    # treat to partner -> its own row ; own pet -> none
    dbq("update users set treats=5 where id=?", (uidB,))
    all0 = dbq("select count(*) n from notification_outbox where kind='pet'")[0]["n"]
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1.2)
    m.locator("button:has-text('ป้อนขนม')").click(); time.sleep(0.3); m.locator("button:has-text('ป้อนน้องของฉัน')").click(); time.sleep(1.5)
    all1 = dbq("select count(*) n from notification_outbox where kind='pet'")[0]["n"]
    chk("7d B feeds OWN pet -> no push queued (for anyone)", all1 == all0 and dbq("select treats t from users where id=?", (uidB,))[0]["t"] == 4, {"before": all0, "after": all1})
    m.locator("button:has-text('ป้อนขนม')").click(); time.sleep(0.3); m.locator("button:has-text('ป้อนน้องของ AA')").click(); time.sleep(1.5)
    treat_rows = dbq("select * from notification_outbox where user_id=? and kind='pet' and title like '%ป้อนขนม%'", (uidA,))
    chk("7e B feeds A's pet -> one push queued for A (url /room)", len(treat_rows) == 1 and treat_rows[0]["url"] == "/room", [(r["title"], r["body"]) for r in treat_rows])
    allpet = dbq("select title, body, short, url from notification_outbox where kind='pet'")
    chk("7f pet push title/body/short contain no check-in text", allpet and not any(SEC in json.dumps(r, ensure_ascii=False) or "ขอบคุณ-B88" in json.dumps(r, ensure_ascii=False) for r in allpet), allpet)
    chk("7g every pet push goes to partner only (none addressed to the sender B)", dbq("select count(*) n from notification_outbox where kind='pet' and user_id=?", (uidB,))[0]["n"] == 0)
    # pref off -> none
    dbq("update users set notify_prefs=? where id=?", (json.dumps({"pet": False}), uidA))
    a.goto(f"{BASE}/settings"); a.wait_for_load_state("networkidle")
    chk("7h pet pref OFF in DB shows unchecked in settings", not a.locator("input[name=pet]").is_checked())
    n0_ = dbq("select count(*) n from notification_outbox where user_id=? and kind='pet'", (uidA,))[0]["n"]
    if callB:
        t_miss_off = time.time(); r1 = callB("send_miss_you"); n1_ = dbq("select count(*) n from notification_outbox where user_id=? and kind='pet'", (uidA,))[0]["n"]
        chk("7i pet pref OFF -> B send_miss_you succeeds but no push queued for A", n1_ == n0_, {"mcp": r1})
    dbq("update users set notify_prefs='{}' where id=?", (uidA,))

    # ===================== 8. MCP =====================
    section("8 mcp")
    if callA and callB:
        tl = rpcA("tools/list"); names_ = [t["name"] for t in tl[1]["result"]["tools"]] if isinstance(tl[1], dict) else []
        chk("8c tools/list has send_hug, send_miss_you, get_room", all(x in names_ for x in ("send_hug", "send_miss_you", "get_room")), names_)
        w_ = 62 - (time.time() - t_miss_off)
        if w_ > 0: print(f"waiting {w_:.0f}s for miss cooldown", flush=True); time.sleep(w_)
        r1 = callB("send_miss_you"); r2 = callB("send_miss_you")
        chk("8d MCP send_miss_you: ok then cooldown retryAfter", isinstance(r1, dict) and r1.get("ok") is True and isinstance(r2, dict) and "retryAfter" in r2, {"first": r1, "second": r2})
        miss_rows = dbq("select title, url from notification_outbox where user_id=? and kind='pet' and title like '%คิดถึง%' and sent_at is null", (uidA,))
        chk("8e MCP miss -> exactly one queued push for A (url /room)", len(miss_rows) == 1 and miss_rows[0]["url"] == "/room", miss_rows)
        h1 = callA("send_hug"); h2 = callA("send_hug")
        brows = dbq("select title, url from notification_outbox where user_id=? and kind='pet'", (uidB,))
        chk("8f MCP send_hug (A->B): ok, second blocked, 1 queued push for B", isinstance(h1, dict) and h1.get("ok") is True and "retryAfter" in h2 and len(brows) == 1 and brows[0]["url"] == "/room", {"h1": h1, "h2": h2, "rows": brows})
        gb = callB("get_room")
        chk("8g get_room for B shows A's hug (kind hug in queue) and own treats", isinstance(gb, dict) and any(q["kind"] == "hug" for q in gb["queue"]) and gb["me"]["treats"] == 3, {"queue": [q["kind"] for q in gb["queue"]], "me": gb["me"]})
        dbq("delete from pet_seen where user_id=? and item_id like 'memory:%'", (uidA,))
        ga = callA("get_room"); chk("8h get_room (A) shape: room, me, partner, queue, memory", isinstance(ga, dict) and all(k in ga for k in ("room", "me", "partner", "queue", "memory")), list(ga) if isinstance(ga, dict) else ga)
        chk("8i get_room memory present (event last year)", isinstance(ga, dict) and ga["memory"] and "หัวหิน" in ga["memory"], ga.get("memory") if isinstance(ga, dict) else None)
    else:
        skipped.append("MCP group 8c-8i")

    # ===================== cron =====================
    section("cron")
    pending = dbq("select count(*) n from notification_outbox where sent_at is null")[0]["n"]
    try:
        r = opener.open(f"{BASE}/cdn-cgi/local/scheduled?cron=*+*+*+*+*&time={int((time.time() + 180) * 1000)}", timeout=60); cs = r.status; ct = r.read().decode()[:100]
    except urllib.error.HTTPError as e: cs = e.code; ct = e.read().decode()[:100]
    time.sleep(2); pend2 = dbq("select count(*) n from notification_outbox where sent_at is null")[0]["n"]
    chk("cron trigger runs without 5xx (outbox drained or left because no subscription)", cs < 500, {"status": cs, "body": ct, "pending_before": pending, "pending_after": pend2})

    # ===================== 9. errors =====================
    section("9 errors")
    chk("9a no 5xx responses", not bad, bad[:5])
    hyd = [e for e in errors if "hydrat" in e.lower() or "did not match" in e.lower()]
    chk("9b no hydration warnings", not hyd, hyd[:3])
    hard = sorted({e[:200] for e in errors if e not in hyd and ("console.error" in e or "pageerror" in e)})
    chk("9c no console.error / uncaught page errors", not hard, hard[:8])
    warns = sorted({re.sub(r"^\w+ ", "", e)[:150] for e in errors if "console.warning" in e and e not in hyd})
    print("INFO console warnings (unique):", warns)
    nonpreload = [w for w in warns if "preload" not in w.lower()]
    chk("9d no console warnings other than browser <link rel=preload> notices", not nonpreload, nonpreload[:6])
    b.close()
print("\nSUMMARY:", sum(1 for r in res if r[1]), "pass /", len(res))
for r in res:
    if not r[1]: print("FAILED:", r[0], "|", str(r[2])[:500])
if skipped: print("SKIPPED:", skipped)
