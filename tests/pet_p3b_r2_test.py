"""QA P3B round 2 (review fixes). vite preview :4175 of a fresh QA copy.  python3 pet_p3b_r2_test.py [qa_dir]"""
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
def corner(pg): return pg.locator("a[aria-label^='ไปห้องของน้อง']")
def has_dot(pg): return corner(pg).count() > 0 and "มีเรื่องใหม่" in (corner(pg).first.get_attribute("aria-label") or "")
def overlap(r1, r2): return not (r1["x"] + r1["width"] <= r2["x"] or r2["x"] + r2["width"] <= r1["x"] or r1["y"] + r1["height"] <= r2["y"] or r2["y"] + r2["height"] <= r1["y"])
def add_event(pg, title, date=None):
    pg.goto(f"{BASE}/calendar"); pg.fill("#title", title)
    if date: pg.fill("#date", date)
    pg.fill("#time", "19:00"); pg.fill("#endTime", "21:00"); pg.click("text=บันทึกนัด"); pg.wait_for_load_state("networkidle"); time.sleep(0.5)
clock = datetime.now(BKK); today = clock.date().isoformat(); tomorrow = (clock.date() + timedelta(days=1)).isoformat()
EA = f"ra{stamp}@test.dev"; EB = f"rb{stamp}@test.dev"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    mk = lambda: (lambda c: (c, c.new_page()))(b.new_context(viewport={"width": 390, "height": 844}, locale="th-TH", timezone_id="Asia/Bangkok", is_mobile=True, has_touch=True))
    Ax, a = mk(); Bx, m = mk(); hook(a, "A"); hook(m, "B")
    a.goto(f"{BASE}/signup"); a.fill("#name", "AA"); a.fill("#email", EA); a.fill("#password", PW); a.click("button[type=submit]"); a.wait_for_url(re.compile("/onboarding"))
    a.fill("#name", "R2 QA"); a.fill("#anniversary", "2023-02-14"); a.locator("form").first.locator("button[type=submit]").click(); a.wait_for_url(re.compile("/calendar"))
    a.goto(f"{BASE}/settings"); code = a.locator("code.font-mono").first.inner_text().strip()
    m.goto(f"{BASE}/signup"); m.fill("#name", "BB"); m.fill("#email", EB); m.fill("#password", PW); m.click("button[type=submit]"); m.wait_for_url(re.compile("/onboarding"))
    m.locator("#code").fill(code); m.locator("form").nth(1).locator("button[type=submit]").click(); m.wait_for_url(re.compile("/calendar"))
    mp = Bx.new_page(); hook(mp, "B2")

    # ---- 1. scroll ----
    print("== 1 scroll", flush=True)
    sy = lambda: a.evaluate("window.scrollY")
    a.goto(f"{BASE}/calendar"); a.wait_for_load_state("networkidle"); time.sleep(1)
    a.evaluate("window.scrollTo(0, document.querySelector('#cal').getBoundingClientRect().top + window.scrollY - 250)"); time.sleep(0.4); y0 = sy()
    chk("1pre scrolled down to the grid", y0 > 300, y0)
    day = a.locator("#cal a[href*='&d='], #cal a[href*='?m=']").filter(has_text=re.compile(r"^\s*\d+\s*$")).nth(20)
    day = a.locator("#cal .grid-cols-7.gap-1 a").nth(20); day.click(); time.sleep(1.0); y1 = sy()
    chk("1a tap a day -> scrollY stays (not 0)", y1 > 200 and abs(y1 - y0) < 150, {"before": y0, "after": y1, "url": a.url})
    for lab, sel in (("next", "a[aria-label='เดือนถัดไป']"), ("prev", "a[aria-label='เดือนก่อน']"), ("today", "#cal a:has-text('วันนี้')")):
        a.evaluate("window.scrollTo(0, document.querySelector('#cal').getBoundingClientRect().top + window.scrollY - 250)"); time.sleep(0.3); yb = sy(); a.locator(sel).click(); time.sleep(1.0); ya = sy()
        chk(f"1b {lab}: scrollY stays", ya > 200 and abs(ya - yb) < 150, {"before": yb, "after": ya})
    a.screenshot(path=f"{SHOT}/p3b-r2-calendar-scrolled-mobile.png")
    in_view = lambda sel: a.evaluate("s => { const r = document.querySelector(s).getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 ? Math.round(r.top) : null }", sel)
    a.goto(f"{BASE}/calendar?d={tomorrow}"); a.wait_for_load_state("networkidle")
    a.fill("#title", "ผ่านR2"); a.fill("#time", "20:00"); a.fill("#endTime", "21:00"); a.click("text=บันทึกนัด"); a.wait_for_load_state("networkidle"); time.sleep(1.0)
    chk("1c create event OK -> redirect with #cal, grid in view", in_view("#cal") is not None and a.locator("li:has-text('ผ่านR2')").count() == 1, {"url": a.url, "cal_top": in_view("#cal"), "scrollY": sy()})
    a.goto(f"{BASE}/calendar?d={tomorrow}"); a.wait_for_load_state("networkidle"); a.fill("#title", "เสียR2"); a.fill("#endDate", today); a.click("text=บันทึกนัด"); a.wait_for_load_state("networkidle"); time.sleep(1.0)
    err = a.locator("#cal-form p.text-destructive")
    chk("1d invalid event -> #cal-form with error text in view", in_view("#cal-form") is not None and err.count() == 1 and err.is_visible() and "ก่อนวันเริ่ม" in err.inner_text(), {"url": a.url, "top": in_view("#cal-form"), "err": err.inner_text() if err.count() else None})
    a.screenshot(path=f"{SHOT}/p3b-r2-calendar-invalid-mobile.png")

    # ---- 2. corner race ----
    print("== 2 corner race", flush=True)
    add_event(mp, "ข่าวใหม่C1", tomorrow)
    a.goto(f"{BASE}/room"); a.wait_for_load_state("networkidle"); time.sleep(3.3); close_bubble(a)
    a.locator("nav.fixed a[href='/dashboard']").click(); a.wait_for_url(re.compile("/dashboard")); t0 = time.time(); seen_dot = []
    while time.time() - t0 < 6:
        seen_dot.append(has_dot(a)); time.sleep(0.4)
    time.sleep(0.5); a.screenshot(path=f"{SHOT}/p3b-r2-corner-after-softnav-mobile.png")
    chk("2a room -> soft nav to /dashboard: no dot within 6 s", corner(a).count() == 1 and not any(seen_dot), {"samples": len(seen_dot), "dots": sum(seen_dot)})
    time.sleep(1.0); chk("2b still no dot (2 more checks)", not has_dot(a) and (time.sleep(1.5) or not has_dot(a)))
    add_event(mp, "ข่าวใหม่C2", tomorrow)
    a.goto(f"{BASE}/dashboard"); a.wait_for_load_state("networkidle"); time.sleep(0.5)
    chk("2c B new activity -> A reloads /dashboard -> dot on", has_dot(a))

    # ---- 3. mobile padding on /lists ----
    print("== 3 padding", flush=True)
    a.goto(f"{BASE}/lists"); a.click("text=ของที่ต้องซื้อ"); a.wait_for_url(re.compile("/lists/")); a.wait_for_load_state("networkidle")
    for i in range(12):
        a.fill("input[name=text]", f"รายการ{i+1}"); a.click("button:has-text('เพิ่ม')"); a.wait_for_load_state("networkidle"); time.sleep(0.15)
    a.evaluate("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(0.6)
    rows = a.locator("li"); n = rows.count(); last = rows.nth(n - 1); btns = last.locator("button"); cb = corner(a).first.bounding_box()
    ov = [btns.nth(i).get_attribute("aria-label") for i in range(btns.count()) if overlap(btns.nth(i).bounding_box(), cb)]
    lb = last.bounding_box()
    chk("3a /lists (12+ items) scrolled to bottom: last row buttons not covered by corner", n >= 11 and btns.count() > 0 and not ov and not overlap(lb, cb), {"rows": n, "last": lb, "corner": cb, "overlap": ov})
    a.screenshot(path=f"{SHOT}/p3b-r2-lists-bottom-mobile.png")

    # ---- 4. picker ----
    print("== 4 picker", flush=True)
    a.goto(f"{BASE}/room"); a.wait_for_load_state("networkidle"); time.sleep(3.3); close_bubble(a)
    a.goto(f"{BASE}/calendar"); a.wait_for_load_state("networkidle"); time.sleep(1.5)
    pb = a.locator("button[aria-label^='เปลี่ยนห้อง']"); lab0 = pb.get_attribute("aria-label")
    chk("4a aria-label = 'เปลี่ยนห้อง (<room>)'", re.fullmatch(r"เปลี่ยนห้อง \(.+\)", lab0 or "") is not None, lab0)
    pb.click(); time.sleep(0.2); pop = a.locator("[role=group][aria-label='เลือกห้อง']")
    names = [pop.locator("button").nth(i).inner_text().replace("✓", "").strip() for i in range(5)]
    cur = lab0[lab0.index("(") + 1:-1]
    tgt = next(x for x in names if x != cur); pop.locator("button", has_text=tgt).first.click(); time.sleep(0.5)
    lab1 = a.locator("button[aria-label^='เปลี่ยนห้อง']").get_attribute("aria-label")
    chk("4b label updates after picking", lab1 == f"เปลี่ยนห้อง ({tgt})" and cur in names, {"before": lab0, "after": lab1})
    # Escape with picker + bubble both open
    add_event(mp, "ข่าวใหม่C3", tomorrow)
    a.goto(f"{BASE}/calendar"); a.wait_for_load_state("networkidle"); wait(lambda: bubble(a).count(), 8)
    a.locator("button[aria-label^='เปลี่ยนห้อง']").click(); time.sleep(0.3)
    both = bubble(a).count() == 1 and pop.count() == 1
    a.screenshot(path=f"{SHOT}/p3b-r2-picker-and-bubble-mobile.png")
    a.keyboard.press("Escape"); time.sleep(0.4)
    chk("4c Escape with picker+bubble open closes ONLY the picker", both and pop.count() == 0 and bubble(a).count() == 1, {"both_open_before": both, "picker_after": pop.count(), "bubble_after": bubble(a).count()})
    a.keyboard.press("Escape"); time.sleep(0.4); print("INFO second Escape closes bubble:", bubble(a).count() == 0, flush=True)
    close_bubble(a)
    # Tab out
    a.locator("button[aria-label^='เปลี่ยนห้อง']").click(); time.sleep(0.2); a.locator("[role=group][aria-label='เลือกห้อง'] button").last.focus()
    a.keyboard.press("Tab"); time.sleep(0.4)
    foc = a.evaluate("document.activeElement?.innerText?.trim() || document.activeElement?.tagName")
    chk("4d Tab out of popover closes it", pop.count() == 0, {"focus_now": foc})
    a.locator("button[aria-label^='เปลี่ยนห้อง']").click(); time.sleep(0.2); a.keyboard.press("Shift+Tab"); a.keyboard.press("Shift+Tab"); time.sleep(0.4)
    print("INFO shift-tab twice closes:", pop.count() == 0, flush=True)

    # ---- 5. safeNext ----
    print("== 5 safeNext", flush=True)
    for nx in ("/\\evil.com", "//evil.com", "/\\/evil.com", "https://evil.com"):
        cx = b.new_context(); pg = cx.new_page(); hook(pg, "L")
        pg.goto(f"{BASE}/login?next=" + urllib.parse.quote(nx, safe="")); pg.fill("#email", EA); pg.fill("#password", PW)
        nxt = pg.locator("input[name=next]").get_attribute("value") if pg.locator("input[name=next]").count() else None
        pg.click("button[type=submit]"); pg.wait_for_url(lambda u: "/login" not in u, timeout=20000); pg.wait_for_load_state("networkidle")
        u = urllib.parse.urlparse(pg.url)
        chk(f"5 login next={nx!r} -> stays on-site, /calendar", u.netloc == "localhost:4175" and u.path == "/calendar", {"url": pg.url, "hidden_next": nxt}); cx.close()
    cx = b.new_context(); pg = cx.new_page(); pg.goto(f"{BASE}/login?next=%2Fplans"); pg.fill("#email", EA); pg.fill("#password", PW); pg.click("button[type=submit]"); pg.wait_for_url(lambda u: "/login" not in u, timeout=20000)
    chk("5e control: next=/plans still honoured", path_of(pg) == "/plans", pg.url); cx.close()

    # ---- 7 ----
    hyd = [e for e in errors if "hydrat" in e.lower() or "did not match" in e.lower()]
    hard = sorted({e[:200] for e in errors if "console.error" in e or "pageerror" in e})
    warns = sorted({e[:160] for e in errors if "console.warning" in e and "preload" not in e.lower()})
    chk("7a no 5xx", not bad, bad[:5]); chk("7b no hydration warnings", not hyd, hyd[:3]); chk("7c no console.error/pageerror", not hard, hard[:6]); chk("7d no non-preload warnings", not warns, warns[:5])
    b.close()
print("\nSUMMARY:", sum(1 for r in res if r[1]), "pass /", len(res))
for r in res:
    if not r[1]: print("FAILED:", r[0], "|", str(r[2])[:500])
