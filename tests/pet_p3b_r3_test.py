"""QA P3B round 3 (room on /dashboard). vite preview :4175 of a fresh QA copy.  python3 pet_p3b_r2_test.py [qa_dir]"""
import re, sys, time, urllib.parse
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4175"; SHOT = "/home/claude/p3-assets/qa"; BKK = timezone(timedelta(hours=7))
stamp = str(int(time.time())); PW = "password123"; res = []; errors = []; bad = []
def chk(name, ok, ev=""):
    res.append((name, bool(ok), ev)); print("PASS" if ok else "FAIL", name, "|", str(ev)[:500], flush=True)
def hook(page, tag):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror {e}"))
    page.on("console", lambda m: m.type in ("error", "warning") and errors.append(f"{tag} console.{m.type} {m.text[:240]}"))
    page.on("response", lambda r: r.status >= 500 and bad.append(f"{tag} {r.status} {r.url}"))
def path_of(pg): return urllib.parse.urlparse(pg.url).path
G = "[role=group][aria-label^='ข้อความจาก']"
def bubble(pg): return pg.locator(G)
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
def ppet(pg, name): return pg.locator(f"button[aria-label^='น้องของ {name}']")
def btext(pg):
    l = bubble(pg); return l.locator("p.sr-only").inner_text().strip() if l.count() else None
def corner(pg): return pg.locator("a[aria-label^='ไปห้องของน้อง']")
def has_dot(pg): return corner(pg).count() > 0 and "มีเรื่องใหม่" in (corner(pg).first.get_attribute("aria-label") or "")
def overlap(r1, r2): return not (r1["x"] + r1["width"] <= r2["x"] or r2["x"] + r2["width"] <= r1["x"] or r1["y"] + r1["height"] <= r2["y"] or r2["y"] + r2["height"] <= r1["y"])
def add_event(pg, title, date=None):
    pg.goto(f"{BASE}/calendar"); pg.fill("#title", title)
    if date: pg.fill("#date", date)
    pg.fill("#time", "19:00"); pg.fill("#endTime", "21:00"); pg.click("text=บันทึกนัด"); pg.wait_for_load_state("networkidle"); time.sleep(0.5)
clock = datetime.now(BKK); today = clock.date().isoformat(); tomorrow = (clock.date() + timedelta(days=1)).isoformat()
EA = f"ca{stamp}@test.dev"; EB = f"cb{stamp}@test.dev"; EN = f"cn{stamp}@test.dev"
def view_dash(pg):
    pg.goto(f"{BASE}/dashboard"); pg.wait_for_load_state("networkidle"); time.sleep(3.3); close_bubble(pg); time.sleep(0.5); close_bubble(pg); time.sleep(2.0)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    mk = lambda: (lambda c: (c, c.new_page()))(b.new_context(viewport={"width": 390, "height": 844}, locale="th-TH", timezone_id="Asia/Bangkok", is_mobile=True, has_touch=True))
    Ax, a = mk(); Bx, m = mk(); hook(a, "A"); hook(m, "B")
    print("== 1 landing", flush=True)
    a.goto(f"{BASE}/signup"); a.fill("#name", "AA"); a.fill("#email", EA); a.fill("#password", PW); a.click("button[type=submit]"); a.wait_for_url(re.compile("/onboarding"))
    chk("1a signup -> /onboarding", path_of(a) == "/onboarding")
    a.fill("#name", "R3 QA"); a.fill("#anniversary", "2023-02-14"); a.locator("form").first.locator("button[type=submit]").click(); a.wait_for_url(re.compile("/dashboard|/calendar"))
    chk("1b signup + create couple -> /dashboard", path_of(a) == "/dashboard", a.url)
    a.goto(f"{BASE}/settings"); code = a.locator("code.font-mono").first.inner_text().strip()
    m.goto(f"{BASE}/signup"); m.fill("#name", "BB"); m.fill("#email", EB); m.fill("#password", PW); m.click("button[type=submit]"); m.wait_for_url(re.compile("/onboarding"))
    m.locator("#code").fill(code); m.locator("form").nth(1).locator("button[type=submit]").click(); m.wait_for_url(re.compile("/dashboard|/calendar"))
    chk("1c join couple -> /dashboard", path_of(m) == "/dashboard", m.url)
    mp = Bx.new_page(); hook(mp, "B2")
    def login_to(email, nxt=None, wait_re="/dashboard|/calendar|/onboarding"):
        cx = b.new_context(viewport={"width": 1280, "height": 800}, locale="th-TH"); pg = cx.new_page(); hook(pg, "L")
        pg.goto(f"{BASE}/login" + (f"?next={urllib.parse.quote(nxt, safe='')}" if nxt else "")); pg.fill("#email", email); pg.fill("#password", PW); pg.click("button[type=submit]")
        pg.wait_for_url(lambda u: "/login" not in u, timeout=20000); pg.wait_for_load_state("networkidle"); return cx, pg
    cx, l = login_to(EA); chk("1d login -> /dashboard", path_of(l) == "/dashboard", l.url)
    l.goto(f"{BASE}/"); l.wait_for_load_state("networkidle"); chk("1e / while logged in -> /dashboard", path_of(l) == "/dashboard", l.url); cx.close()
    nx = b.new_context(); n = nx.new_page(); hook(n, "N"); n.goto(f"{BASE}/signup"); n.fill("#name", "NN"); n.fill("#email", EN); n.fill("#password", PW); n.click("button[type=submit]"); n.wait_for_url(re.compile("/onboarding"))
    n.goto(f"{BASE}/"); n.wait_for_load_state("networkidle"); r1 = path_of(n); n.goto(f"{BASE}/dashboard"); n.wait_for_load_state("networkidle")
    chk("1f no-couple user: / and /dashboard -> /onboarding", r1 == "/onboarding" and path_of(n) == "/onboarding", [r1, path_of(n)]); nx.close()
    for bad_next in ("/\\evil.com", "//evil.com"):
        cx, l = login_to(EA, bad_next); u = urllib.parse.urlparse(l.url)
        chk(f"1g login next={bad_next!r} -> /dashboard on-site", u.netloc == "localhost:4175" and u.path == "/dashboard", l.url); cx.close()

    print("== 2 dashboard room", flush=True)
    a.goto(f"{BASE}/dashboard"); a.wait_for_load_state("networkidle"); time.sleep(2.0)
    sec = a.locator("section[aria-label='ห้องของน้อง']"); h1 = a.locator("h1").first
    chk("2a room section above the greeting h1", sec.count() == 1 and sec.bounding_box()["y"] + 1 < h1.bounding_box()["y"], {"sec": sec.bounding_box(), "h1": h1.bounding_box(), "h1_text": h1.inner_text()})
    a.screenshot(path=f"{SHOT}/p3b-r3-dashboard-top-room-mobile.png")
    sc = sec.locator("div.overflow-hidden").first.bounding_box(); pbn = a.locator("button[aria-label^='เปลี่ยนห้อง']"); bb = pbn.bounding_box()
    chk("2b picker button top-right of scene; only one", pbn.count() == 1 and bb["x"] + bb["width"] > sc["x"] + sc["width"] * 0.85 and bb["y"] < sc["y"] + sc["height"] * 0.2, {"btn": bb, "scene": sc})
    chk("2c actions bar present (กอด/คิดถึง/ป้อนขนม)", all(a.locator(f"button:has-text('{t}')").count() >= 1 for t in ("กอด", "คิดถึง", "ป้อนขนม")))
    pbn.click(); time.sleep(0.3); pop = a.locator("[role=group][aria-label='เลือกห้อง']"); n5 = pop.locator("button").count()
    a.screenshot(path=f"{SHOT}/p3b-r3-dashboard-picker-open-mobile.png"); a.keyboard.press("Escape"); time.sleep(0.3)
    chk("2d picker opens with 5 rooms, Escape closes", n5 == 5 and pop.count() == 0)
    chk("2e partner pet absent before B acts", ppet(a, "BB").count() == 0)
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1.5)
    t0 = time.time(); m.locator("button:has-text('กอด')").click(); w = bb_ = None; end = time.time() + 12
    while time.time() < end:
        if w is None and a.locator("section[aria-label='ห้องของน้อง'] .pet-walk-in").count(): w = time.time() - t0
        if bb_ is None and bubble(a).count(): bb_ = time.time() - t0
        if w is not None and bb_ is not None: break
        time.sleep(0.05)
    chk("2f B hugs -> A's dashboard room shows walk-in + bubble live (no reload)", w is not None and bb_ is not None, {"walk_s": w, "bubble_s": bb_, "text": btext(a)})
    close_bubble(a); time.sleep(2.0)
    add_event(mp, "เรียลไทม์D1", tomorrow); a.goto(f"{BASE}/dashboard") if False else None
    got = wait(lambda: bubble(a).count() and "เรียลไทม์D1" in (btext(a) or ""), 12)
    chk("2g B creates event -> speech on A's dashboard room live", bool(got), btext(a)); close_bubble(a); time.sleep(2.0)
    # list item toggle on dashboard: no replay
    mp.goto(f"{BASE}/lists"); mp.click("text=ของที่ต้องซื้อ"); mp.wait_for_url(re.compile("/lists/")); mp.wait_for_load_state("networkidle")
    for t_ in ("ทดสอบทิก1", "ทดสอบทิก2"):
        mp.fill("input[name=text]", t_); mp.click("button:has-text('เพิ่ม')"); mp.wait_for_load_state("networkidle"); time.sleep(0.3)
    time.sleep(2.5); close_bubble(a)
    a.goto(f"{BASE}/dashboard"); a.wait_for_load_state("networkidle"); time.sleep(3.3); close_bubble(a); time.sleep(2.0)
    a.evaluate("() => { document.querySelector(\"section[aria-label='ห้องของน้อง']\").dataset.qaMark = '1'; const pb = document.querySelector(\"button[aria-label^='น้องของ BB']\"); if (pb) pb.dataset.qaMark = '1'; window.__qa = 1 }")
    row = a.locator("li:has-text('ทดสอบทิก1')"); chk("2h dashboard shows toggleable open item", row.count() == 1)
    row.locator("button[aria-label='ทำเสร็จแล้ว']").click(); a.wait_for_load_state("networkidle")
    walks = []; end = time.time() + 3.5
    while time.time() < end:
        walks.append(a.evaluate("() => ({w: document.querySelectorAll('.pet-walk-in').length, b: document.querySelectorAll(\"[role=group][aria-label^='ข้อความจาก']\").length})")); time.sleep(0.2)
    st = a.evaluate("() => ({qa: window.__qa || null, sec: document.querySelector(\"section[aria-label='ห้องของน้อง']\")?.dataset.qaMark || null, partner: document.querySelector(\"button[aria-label^='น้องของ BB']\")?.dataset.qaMark || null})")
    chk("2i toggle done on dashboard: item gone, room not replayed (no walk-in/bubble) and room nodes kept", a.locator("li:has-text('ทดสอบทิก1')").count() == 0 and not any(x["w"] or x["b"] for x in walks) and st["sec"] == "1" and st["partner"] == "1", {"state": st, "replay": [x for x in walks if x["w"] or x["b"]][:2]})
    a.screenshot(path=f"{SHOT}/p3b-r3-dashboard-after-toggle-mobile.png")
    Dx = b.new_context(viewport={"width": 1280, "height": 800}, locale="th-TH", timezone_id="Asia/Bangkok"); d = Dx.new_page(); hook(d, "D")
    d.goto(f"{BASE}/login"); d.fill("#email", EA); d.fill("#password", PW); d.click("button[type=submit]"); d.wait_for_url(re.compile("/dashboard")); d.wait_for_load_state("networkidle"); time.sleep(3.5); close_bubble(d)
    d.screenshot(path=f"{SHOT}/p3b-r3-dashboard-top-room-desktop.png")
    chk("2j desktop dashboard: room section above h1", d.locator("section[aria-label='ห้องของน้อง']").bounding_box()["y"] < d.locator("h1").first.bounding_box()["y"])

    print("== 3 calendar", flush=True)
    sy = lambda: a.evaluate("window.scrollY")
    a.goto(f"{BASE}/calendar"); a.wait_for_load_state("networkidle"); time.sleep(1.5)
    chk("3a /calendar has NO room section / pets / picker", a.locator("section[aria-label='ห้องของน้อง']").count() == 0 and a.locator("button[aria-label^='เปลี่ยนห้อง']").count() == 0 and a.locator("button[aria-label^='น้องของ']").count() == 0)
    a.screenshot(path=f"{SHOT}/p3b-r3-calendar-no-room-mobile.png")
    place = "window.scrollTo(0, document.querySelector('#cal').getBoundingClientRect().top + window.scrollY + 250)"
    place_nav = "window.scrollTo(0, document.querySelector('#cal').getBoundingClientRect().top + window.scrollY - 110)"
    a.evaluate(place); time.sleep(0.4); y0 = sy()
    chk("3pre scrolled", y0 > 100, y0)
    a.locator("#cal .grid-cols-7.gap-1 a").nth(30).click(); time.sleep(1.0); y1 = sy()
    chk("3b day tap keeps scrollY", y1 > 100 and abs(y1 - y0) < 150, {"before": y0, "after": y1})
    for lab, sel in (("next", "a[aria-label='เดือนถัดไป']"), ("prev", "a[aria-label='เดือนก่อน']"), ("today", "#cal a:has-text('วันนี้')")):
        a.evaluate(place_nav); time.sleep(0.3); yb = sy(); a.locator(sel).click(); time.sleep(1.0); ya = sy()
        mx = a.evaluate("document.documentElement.scrollHeight - innerHeight")
        chk(f"3c {lab} keeps scrollY (real click; nav buttons visible, scrollY>20 and unchanged)", yb > 20 and abs(ya - yb) <= 5, {"before": yb, "after": ya, "max_scroll_after": mx})
    in_view = lambda s: a.evaluate("s => { const r = document.querySelector(s).getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 ? Math.round(r.top) : null }", s)
    a.goto(f"{BASE}/calendar?d={tomorrow}"); a.wait_for_load_state("networkidle"); a.fill("#title", "ผ่านR3"); a.fill("#time", "20:00"); a.fill("#endTime", "21:00"); a.click("text=บันทึกนัด"); a.wait_for_load_state("networkidle"); time.sleep(1.0)
    chk("3d create OK -> #cal in view, event listed", in_view("#cal") is not None and a.locator("li:has-text('ผ่านR3')").count() == 1, {"url": a.url, "top": in_view("#cal")})
    a.goto(f"{BASE}/calendar?d={tomorrow}"); a.wait_for_load_state("networkidle"); a.fill("#title", "เสียR3"); a.fill("#endDate", today); a.click("text=บันทึกนัด"); a.wait_for_load_state("networkidle"); time.sleep(1.0)
    err = a.locator("#cal-form p.text-destructive")
    chk("3e invalid -> #cal-form + error text in view", in_view("#cal-form") is not None and err.count() == 1 and err.is_visible(), {"top": in_view("#cal-form"), "err": err.inner_text() if err.count() else None})

    print("== 4 corner", flush=True)
    for pg_, tag in ((a, "mobile"), (d, "desktop")):
        for pth, want in (("/dashboard", 0), ("/room", 0), ("/calendar", 1), ("/lists", 1), ("/notes", 1), ("/settings", 1)):
            pg_.goto(f"{BASE}{pth}"); pg_.wait_for_load_state("networkidle"); time.sleep(0.3)
            chk(f"4a corner {'visible' if want else 'hidden'} on {pth} ({tag})", corner(pg_).count() == want and (not want or corner(pg_).first.is_visible()))
    for pth in ("/calendar", "/lists", "/notes", "/settings"):
        a.goto(f"{BASE}{pth}"); a.wait_for_load_state("networkidle"); cb = corner(a).first.bounding_box(); navs = a.locator("nav.fixed a"); k = navs.count()
        ov = [i for i in range(k) if overlap(cb, navs.nth(i).bounding_box())]; nt = min(navs.nth(i).bounding_box()["y"] for i in range(k))
        chk(f"4b mobile corner vs bottom nav on {pth}", not ov and cb["y"] + cb["height"] <= nt + 0.5, {"corner": cb, "nav_top": nt})
    a.goto(f"{BASE}/calendar"); a.wait_for_load_state("networkidle"); a.screenshot(path=f"{SHOT}/p3b-r3-corner-calendar-mobile.png")
    corner(a).first.click(); a.wait_for_url(re.compile("/room")); chk("4c tapping corner -> /room", True)
    add_event(mp, "ข่าวใหม่R3", tomorrow)
    a.goto(f"{BASE}/dashboard"); a.wait_for_load_state("networkidle"); time.sleep(3.3); close_bubble(a)
    a.locator("nav.fixed a[href='/calendar']").click(); a.wait_for_url(re.compile("/calendar")); t0 = time.time(); dots = []
    while time.time() - t0 < 6: dots.append(has_dot(a)); time.sleep(0.4)
    chk("4d race: view activity on /dashboard, soft-nav to /calendar -> no dot for 6 s", corner(a).count() == 1 and not any(dots), {"samples": len(dots), "dots": sum(dots)})
    time.sleep(1.0); chk("4e still no dot", not has_dot(a))
    add_event(mp, "ข่าวใหม่R3b", tomorrow); a.goto(f"{BASE}/calendar"); a.wait_for_load_state("networkidle"); time.sleep(0.5)
    chk("4f new B activity -> reload /calendar -> dot on", has_dot(a))

    hyd = [e for e in errors if "hydrat" in e.lower() or "did not match" in e.lower()]
    hard = sorted({e[:200] for e in errors if "console.error" in e or "pageerror" in e})
    warns = sorted({e[:160] for e in errors if "console.warning" in e and "preload" not in e.lower()})
    chk("6a no 5xx", not bad, bad[:5]); chk("6b no hydration warnings", not hyd, hyd[:3]); chk("6c no console.error/pageerror", not hard, hard[:6]); chk("6d no non-preload warnings", not warns, warns[:5])
    b.close()
print("\nSUMMARY:", sum(1 for r in res if r[1]), "pass /", len(res))
for r in res:
    if not r[1]: print("FAILED:", r[0], "|", str(r[2])[:500])
