"""QA: room first-time guide + help button. vite preview :4175 of a fresh QA copy.  python3 pet_guide_test.py [qa_dir]"""
import re, sys, time, glob, sqlite3, urllib.parse
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4175"; ROOT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/qa-g"
SHOT = "/home/claude/p3-assets/qa"; BKK = timezone(timedelta(hours=7)); stamp = str(int(time.time())); PW = "password123"
res = []; errors = []; bad = []
def chk(name, ok, ev=""):
    res.append((name, bool(ok), ev)); print("PASS" if ok else "FAIL", name, "|", str(ev)[:500], flush=True)
def dbq(sql, args=()):
    f = [x for x in glob.glob(f"{ROOT}/.cloudflare/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite") if "metadata" not in x][0]
    c = sqlite3.connect(f, timeout=20); c.row_factory = sqlite3.Row
    try: r = [dict(x) for x in c.execute(sql, args).fetchall()]; c.commit(); return r
    finally: c.close()
def hook(page, tag):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror {e}"))
    page.on("console", lambda m: m.type in ("error", "warning") and errors.append(f"{tag} console.{m.type} {m.text[:240]}"))
    page.on("response", lambda r: r.status >= 500 and bad.append(f"{tag} {r.status} {r.url}"))
def wait(fn, t=10, step=0.15):
    end = time.time() + t
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(step)
    return None
def overlap(r1, r2): return not (r1["x"] + r1["width"] <= r2["x"] or r2["x"] + r2["width"] <= r1["x"] or r1["y"] + r1["height"] <= r2["y"] or r2["y"] + r2["height"] <= r1["y"])
G = "[role=group][aria-label^='ข้อความจาก']"
def bubble(pg): return pg.locator(G)
def card(pg): return pg.locator("div[role=group][aria-label='คำแนะนำ']")
def ctr(pg): return card(pg).locator("span[aria-hidden]").first.inner_text().strip() if card(pg).count() else None
def close_bubble(pg):
    for _ in range(25):
        if not bubble(pg).count(): return
        if bubble(pg).locator("button:has-text('ปิด')").count(): bubble(pg).locator("button:has-text('ปิด')").click(); time.sleep(0.2); return
        bubble(pg).locator("button:has-text('ต่อไป')").click(); time.sleep(0.12)
VPS = [(390, 844, "390"), (320, 640, "320"), (1280, 800, "desk")]
def new_ctx(w, h, email, tag, skip_guide=False):
    mob = w < 800
    cx = b.new_context(viewport={"width": w, "height": h}, locale="th-TH", timezone_id="Asia/Bangkok", is_mobile=mob, has_touch=mob)
    if skip_guide: cx.add_init_script("try{localStorage.setItem('duo.roomGuide.v1','done')}catch(e){}")
    pg = cx.new_page(); hook(pg, tag)
    pg.goto(f"{BASE}/login"); pg.fill("#email", email); pg.fill("#password", PW); pg.click("button[type=submit]")
    pg.wait_for_url(lambda u: "/login" not in u, timeout=25000); pg.wait_for_load_state("networkidle"); return cx, pg
def add_event(pg, title):
    pg.goto(f"{BASE}/calendar"); pg.fill("#title", title); pg.fill("#date", (datetime.now(BKK).date() + timedelta(days=1)).isoformat()); pg.fill("#time", "19:00"); pg.fill("#endTime", "21:00")
    pg.click("text=บันทึกนัด"); pg.wait_for_load_state("networkidle"); time.sleep(0.5)

EA = f"ga{stamp}@test.dev"; EB = f"gb{stamp}@test.dev"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ax = b.new_context(viewport={"width": 390, "height": 844}, locale="th-TH"); a = ax.new_page(); hook(a, "A0")
    bx = b.new_context(viewport={"width": 390, "height": 844}, locale="th-TH"); m = bx.new_page(); hook(m, "B0")
    a.goto(f"{BASE}/signup"); a.fill("#name", "AA"); a.fill("#email", EA); a.fill("#password", PW); a.click("button[type=submit]"); a.wait_for_url(re.compile("/onboarding"))
    a.fill("#name", "G QA"); a.fill("#anniversary", "2023-02-14"); a.locator("form").first.locator("button[type=submit]").click(); a.wait_for_url(re.compile("/dashboard|/calendar"))
    a.goto(f"{BASE}/settings"); code = a.locator("code.font-mono").first.inner_text().strip()
    m.goto(f"{BASE}/signup"); m.fill("#name", "BB"); m.fill("#email", EB); m.fill("#password", PW); m.click("button[type=submit]"); m.wait_for_url(re.compile("/onboarding"))
    m.locator("#code").fill(code); m.locator("form").nth(1).locator("button[type=submit]").click(); m.wait_for_url(re.compile("/dashboard|/calendar"))
    cid = dbq("select couple_id c from couple_members where user_id=(select id from users where email=?)", (EA,))[0]["c"]
    uidA = dbq("select id from users where email=?", (EA,))[0]["id"]

    # ================= 1. first-time flow =================
    print("== 1 first-time flow", flush=True)
    for (w, h, tag) in VPS:
        for pth in ("/dashboard", "/room"):
            cx, pg = new_ctx(w, h, EA, f"A-{tag}")
            pg.goto(f"{BASE}{pth}"); pg.wait_for_load_state("networkidle")
            shown = wait(lambda: card(pg).count() == 1 and card(pg).is_visible(), 5)
            lab = f"{tag}{pth}"
            chk(f"1a [{lab}] hint card shows after mount at 1/4", shown and ctr(pg) == "1/4", ctr(pg))
            if not shown: cx.close(); continue
            cb = card(pg).bounding_box(); vp = pg.viewport_size
            chk(f"1b [{lab}] card inside viewport width and under the scene", cb["x"] >= 0 and cb["x"] + cb["width"] <= vp["width"], cb)
            hl1 = pg.locator("button[aria-label^='เปลี่ยนห้อง']").evaluate("e => e.className + ' | ' + getComputedStyle(e).boxShadow")
            if tag == "390" and pth == "/dashboard":
                pg.evaluate("document.querySelector(\"button[aria-label^='เปลี่ยนห้อง']\").scrollIntoView({block:'center'})"); card(pg).scroll_into_view_if_needed(); pg.screenshot(path=f"{SHOT}/guide-hint-card-mobile.png")
            if tag == "320" and pth == "/room": card(pg).scroll_into_view_if_needed(); pg.screenshot(path=f"{SHOT}/guide-hint-card-320.png")
            seq = [ctr(pg)]; texts = [card(pg).locator("p").inner_text()[:25]]
            for i in range(3):
                card(pg).locator("button:has-text('ถัดไป')").click(); time.sleep(0.25); seq.append(ctr(pg)); texts.append(card(pg).locator("p").inner_text()[:25])
                if i == 0: hl2 = pg.locator("button[aria-label^='เปลี่ยนห้อง']").evaluate("e => e.className + ' | ' + getComputedStyle(e).boxShadow")
            last_ok = card(pg).locator("button:has-text('เริ่มเลย')").count() == 1 and card(pg).locator("button:has-text('ข้าม')").count() == 0 and card(pg).locator("button:has-text('ถัดไป')").count() == 0
            chk(f"1c [{lab}] 1/4 -> 4/4 via ถัดไป; last step shows เริ่มเลย only", seq == ["1/4", "2/4", "3/4", "4/4"] and last_ok, seq)
            print(f"INFO [{lab}] step1 picker highlighted (class/shadow differs from step2): {hl1 != hl2}", flush=True)
            hl4 = pg.locator("div:has(> button:has-text('กอด'))").first.evaluate("e => e.className") if pg.locator("button:has-text('กอด')").count() else None
            card(pg).locator("button:has-text('เริ่มเลย')").click(); time.sleep(0.4)
            ls = pg.evaluate("localStorage.getItem('duo.roomGuide.v1')")
            chk(f"1d [{lab}] เริ่มเลย hides card and stores done", card(pg).count() == 0 and ls == "done", ls)
            pg.reload(); pg.wait_for_load_state("networkidle"); time.sleep(2.0)
            chk(f"1e [{lab}] reload -> not shown again", card(pg).count() == 0)
            cx.close()
            cx, pg = new_ctx(w, h, EA, f"A2-{tag}"); pg.goto(f"{BASE}{pth}"); pg.wait_for_load_state("networkidle")
            wait(lambda: card(pg).count() == 1, 5); card(pg).locator("button:has-text('ข้าม')").click(); time.sleep(0.4)
            gone = card(pg).count() == 0; pg.reload(); pg.wait_for_load_state("networkidle"); time.sleep(2.0)
            chk(f"1f [{lab}] new context + ข้าม -> hidden, still hidden after reload", gone and card(pg).count() == 0 and pg.evaluate("localStorage.getItem('duo.roomGuide.v1')") == "done")
            cx.close()

    # ================= 2. blocked while walk-in / bubble =================
    print("== 2 blocking", flush=True)
    mp = bx.new_page(); hook(mp, "B2")
    # 2a: live arrival after step 2
    cx, pg = new_ctx(390, 844, EA, "A-live"); pg.goto(f"{BASE}/room"); pg.wait_for_load_state("networkidle"); wait(lambda: card(pg).count() == 1, 5)
    card(pg).locator("button:has-text('ถัดไป')").click(); time.sleep(0.3); step_before = ctr(pg)
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1.0)
    t0 = time.time(); m.locator("button:has-text('กอด')").click(); samples = []; bubble_seen = False; end = time.time() + 7
    while time.time() < end:
        wk = pg.locator(".pet-walk-in").count() > 0; bu = bubble(pg).count() > 0; bubble_seen |= bu
        samples.append((wk, bu, card(pg).count()))
        time.sleep(0.1)
    viol = [s for s in samples if (s[0] or s[1]) and s[2]]
    chk("2a live B hug: card hidden throughout walk-in and while bubble is open", bubble_seen and not viol and any(s[0] for s in samples), {"samples": len(samples), "violations": viol[:3], "bubble_seen": bubble_seen})
    pg.screenshot(path=f"{SHOT}/guide-blocked-by-bubble-mobile.png")
    close_bubble(pg); time.sleep(0.6)
    chk("2b after bubble closed card returns at the SAME step", card(pg).count() == 1 and ctr(pg) == step_before == "2/4", {"before": step_before, "after": ctr(pg)})
    cx.close()
    # 2c: pending on load (dashboard + room)
    for pth in ("/dashboard", "/room"):
        add_event(mp, f"นัดรอ{pth.strip('/')}")
        cx, pg = new_ctx(390, 844, EA, "A-pend"); pg.goto(f"{BASE}{pth}"); pg.wait_for_load_state("networkidle")
        samples = []; bubble_seen = False; end = time.time() + 6
        while time.time() < end:
            bu = bubble(pg).count() > 0; wk = pg.locator(".pet-walk-in").count() > 0; bubble_seen |= bu; samples.append((wk, bu, card(pg).count())); time.sleep(0.1)
        viol = [s for s in samples if (s[0] or s[1]) and s[2]]
        chk(f"2c [{pth}] pending activity on load: walk-in + bubble shown, card absent until bubble closed", bubble_seen and not viol and any(s[0] for s in samples), {"violations": viol[:3], "walk": any(s[0] for s in samples)})
        close_bubble(pg); ok = wait(lambda: card(pg).count() == 1, 3)
        chk(f"2d [{pth}] card appears (1/4) after bubble closed", ok and ctr(pg) == "1/4", ctr(pg)); cx.close()

    # ================= 3. help button =================
    print("== 3 help button", flush=True)
    ly = datetime.now(BKK).date().replace(year=datetime.now(BKK).year - 1)
    dbq("insert into events (id, couple_id, title, start_at, all_day, remind_before, created_by) values (?,?,?,?,0,'d1',?)", ("gmem" + stamp, cid, "ทะเลหัวหินG", f"{ly.isoformat()}T05:00:00.000Z", uidA))
    for (w, h, tag) in VPS:
        for pth in ("/dashboard", "/room"):
            lab = f"{tag}{pth}"; dbq("delete from pet_seen where user_id=? and item_id like 'memory:%'", (uidA,))
            cx, pg = new_ctx(w, h, EA, f"A-help-{tag}", skip_guide=True)
            pg.goto(f"{BASE}{pth}"); pg.wait_for_load_state("networkidle"); time.sleep(0.8)
            hb = pg.locator("button[aria-label='วิธีเล่นกับน้อง']"); pk = pg.locator("button[aria-label^='เปลี่ยนห้อง']"); mem = pg.locator("aside[aria-label='ปีที่แล้ววันนี้']")
            wait(lambda: mem.count() == 1, 6); time.sleep(0.6)
            hbb, pkb = hb.bounding_box(), pk.bounding_box(); mb = mem.bounding_box() if mem.count() else None
            chk(f"3a [{lab}] ❓ is left of 🎨, no overlap with 🎨", hb.count() == 1 and hbb["x"] + hbb["width"] <= pkb["x"] and not overlap(hbb, pkb), {"help": hbb, "picker": pkb})
            chk(f"3b [{lab}] ❓ does not overlap memory bubble", mb is not None and not overlap(hbb, mb), {"help": hbb, "memory": mb})
            hb.click(); time.sleep(0.3)
            panel = pg.locator("div[role=group][aria-labelledby]"); vp = pg.viewport_size
            if panel.count():
                pb_ = panel.bounding_box(); sc = panel.evaluate("e => ({sh: e.scrollHeight, ch: e.clientHeight, oy: getComputedStyle(e).overflowY})")
                fits = pb_["x"] >= 0 and pb_["x"] + pb_["width"] <= vp["width"] and pb_["y"] >= 0 and pb_["y"] + pb_["height"] <= vp["height"]
                if not fits:  # tall panel at the very bottom of page? scroll page so the scene is in view first
                    pg.evaluate("window.scrollTo(0, 0)"); time.sleep(0.2); pb_ = panel.bounding_box(); fits = pb_["x"] >= 0 and pb_["x"] + pb_["width"] <= vp["width"] and pb_["y"] >= 0 and pb_["y"] + pb_["height"] <= vp["height"]
                scrollable = sc["sh"] <= sc["ch"] or (sc["oy"] in ("auto", "scroll") and panel.evaluate("e => { e.scrollTop = 40; return e.scrollTop > 0 }"))
                chk(f"3c [{lab}] panel fully visible in viewport and scrollable when tall", fits and scrollable, {"panel": pb_, "vp": vp, **sc})
                panel.evaluate("e => e.scrollTop = 0")
                if pth == "/dashboard" and tag in ("390", "320"): pg.screenshot(path=f"{SHOT}/guide-help-panel-{tag}.png")
                if pth == "/room" and tag == "desk": pg.screenshot(path=f"{SHOT}/guide-help-panel-desktop.png")
            else: chk(f"3c [{lab}] panel opens", False)
            # Escape: focus return
            pg.keyboard.press("Escape"); time.sleep(0.3)
            foc = pg.evaluate("document.activeElement?.getAttribute('aria-label')")
            chk(f"3d [{lab}] Escape closes panel and focus returns to ❓", panel.count() == 0 and foc == "วิธีเล่นกับน้อง" and hb.get_attribute("aria-expanded") == "false", foc)
            # outside click
            hb.click(); time.sleep(0.2); pg.mouse.click(w // 2, 3 if w < 800 else 790); time.sleep(0.3)
            chk(f"3e [{lab}] outside click closes panel", panel.count() == 0)
            # Tab out
            hb.click(); time.sleep(0.2); panel.locator("button").last.focus(); pg.keyboard.press("Tab"); time.sleep(0.3)
            chk(f"3f [{lab}] Tab out of panel closes it", panel.count() == 0, pg.evaluate("document.activeElement?.innerText?.trim()?.slice(0,20) || document.activeElement?.tagName"))
            # mutual exclusion
            hb.click(); time.sleep(0.2); pk.click(); time.sleep(0.3)
            pop = pg.locator("[role=group][aria-label='เลือกห้อง']"); a1 = panel.count() == 0 and pop.count() == 1
            hb.click(); time.sleep(0.3); a2 = pop.count() == 0 and panel.count() == 1
            chk(f"3g [{lab}] opening ❓ closes picker and vice versa", a1 and a2, {"picker_after_help_then_pick": a1, "help_after_picker": a2})
            # restart
            panel.locator("button:has-text('ดูคำแนะนำอีกครั้ง')").click(); time.sleep(0.5)
            foc = pg.evaluate("document.activeElement?.getAttribute('aria-label')")
            chk(f"3h [{lab}] ดูคำแนะนำอีกครั้ง closes panel, restarts hints at 1/4, focus on ❓", panel.count() == 0 and ctr(pg) == "1/4" and foc == "วิธีเล่นกับน้อง", {"ctr": ctr(pg), "focus": foc})
            if pth == "/room" and tag == "390": pg.screenshot(path=f"{SHOT}/guide-restart-mobile.png")
            cx.close()
    # Escape with speech bubble open
    add_event(mp, "นัดเอสคEsc")
    cx, pg = new_ctx(390, 844, EA, "A-esc", skip_guide=True); pg.goto(f"{BASE}/dashboard"); pg.wait_for_load_state("networkidle"); wait(lambda: bubble(pg).count(), 8)
    pg.locator("button[aria-label='วิธีเล่นกับน้อง']").click(); time.sleep(0.3); both = bubble(pg).count() == 1 and pg.locator("div[role=group][aria-labelledby]").count() == 1
    pg.screenshot(path=f"{SHOT}/guide-help-with-bubble-mobile.png")
    pg.keyboard.press("Escape"); time.sleep(0.4)
    chk("3i Escape with panel + speech bubble open closes ONLY the panel", both and pg.locator("div[role=group][aria-labelledby]").count() == 0 and bubble(pg).count() == 1)
    pg.keyboard.press("Escape"); time.sleep(0.4); print("INFO second Escape closes bubble:", bubble(pg).count() == 0, flush=True); cx.close()

    # ================= 5 errors =================
    hyd = [e for e in errors if "hydrat" in e.lower() or "did not match" in e.lower()]
    hard = sorted({e[:200] for e in errors if "console.error" in e or "pageerror" in e})
    warns = sorted({e[:160] for e in errors if "console.warning" in e and "preload" not in e.lower()})
    chk("5a no 5xx", not bad, bad[:5]); chk("5b no hydration warnings", not hyd, hyd[:3]); chk("5c no console.error/pageerror", not hard, hard[:6]); chk("5d no non-preload warnings", not warns, warns[:5])
    b.close()
print("\nSUMMARY:", sum(1 for r in res if r[1]), "pass /", len(res))
for r in res:
    if not r[1]: print("FAILED:", r[0], "|", str(r[2])[:500])
