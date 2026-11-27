"""QA: P3A pet room. Run against vite preview on :4174 of a QA copy.
Usage: python3 pet_ui_test.py [duo_qa_dir]   (default /home/claude/duo-qa)
"""
import re, sys, time, glob, sqlite3, socket, json
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4174"
ROOT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/duo-qa"
SHOT = "/home/claude/p3-assets/qa"
BKK = timezone(timedelta(hours=7))
stamp = str(int(time.time())); PW = "password123"
res = []; errors = []; bad = []
def chk(name, ok, ev=""):
    res.append((name, ok, ev)); print("PASS" if ok else "FAIL", name, "|", str(ev)[:400], flush=True)

def dbq(sql, args=()):
    f = [x for x in glob.glob(f"{ROOT}/.cloudflare/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite") if "metadata" not in x][0]
    c = sqlite3.connect(f, timeout=20); c.row_factory = sqlite3.Row
    try:
        r = [dict(x) for x in c.execute(sql, args).fetchall()]; c.commit(); return r
    finally: c.close()

def hook(page, tag):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{tag} console {m.text[:200]}"))
    page.on("response", lambda r: r.status >= 500 and bad.append(f"{tag} {r.status} {r.url}"))

def signup(page, name, email):
    page.goto(f"{BASE}/signup"); page.fill("#name", name); page.fill("#email", email); page.fill("#password", PW)
    page.click("button[type=submit]"); page.wait_for_url(re.compile(r"/onboarding"))
def create_couple(page, name="Duo QA"):
    page.fill("#name", name); page.fill("#anniversary", "2023-02-14")
    page.locator("form").first.locator("button[type=submit]").click(); page.wait_for_url(re.compile(r"/calendar"))
    page.goto(f"{BASE}/settings"); return page.locator("code.font-mono").first.inner_text().strip()
def join(page, code):
    page.locator("#code").fill(code); page.locator("form").nth(1).locator("button[type=submit]").click(); page.wait_for_url(re.compile(r"/calendar"))

def bubble(pg): return pg.locator("[role=group][aria-label^='ข้อความจาก']")
def counter(pg):
    l = pg.locator("[role=group][aria-label^='ข้อความจาก'] span.tabular-nums span[aria-hidden]")
    return l.inner_text().strip() if l.count() else None
def bubble_text(pg):
    l = bubble(pg)
    return l.locator("p.sr-only").inner_text().strip() if l.count() else None
def partner_pet(pg, name): return pg.locator(f"button[aria-label^='น้องของ {name}']")
def add_event(pg, title):
    pg.goto(f"{BASE}/calendar"); pg.fill("#title", title); pg.fill("#time", "19:00"); pg.fill("#endTime", "21:00")
    pg.click("text=บันทึกนัด"); pg.wait_for_load_state("networkidle"); time.sleep(0.5)
def wait(fn, t=10, step=0.25):
    end = time.time() + t
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(step)
    return None
def treats(pg):
    l = pg.locator("button:has-text('ป้อนขนม') span[aria-hidden]")
    return int(re.search(r"\d+", l.first.inner_text()).group()) if l.count() else None
def checkin(pg, mood, energy, need=None, grat=None):
    pg.goto(f"{BASE}/checkin")
    pg.locator(f"label:has(input[name=mood][value='{mood}'])").click(); pg.locator(f"label:has(input[name=energy][value='{energy}'])").click()
    if need: pg.fill("#need", need)
    if grat: pg.fill("#gratitude", grat)
    pg.click("button:has-text('เช็กอิน')"); pg.wait_for_load_state("networkidle"); time.sleep(0.8)
def add_note(pg, title, body, vis=None):
    pg.goto(f"{BASE}/notes/new"); pg.fill("input[name=title]", title); pg.fill("textarea[name=body]", body)
    if vis: pg.select_option("#visibility", vis)
    pg.click("button:has-text('บันทึก')"); pg.wait_for_url(re.compile(r"saved=1")); time.sleep(0.5)

clock = datetime.now(BKK); print("RUN CLOCK (Bangkok):", clock.isoformat(), flush=True)
EA = f"pa{stamp}@test.dev"; EB = f"pb{stamp}@test.dev"; ES = f"ps{stamp}@test.dev"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    mk = lambda tag, w=390, h=844, mob=True: (lambda c: (c, c.new_page()))(b.new_context(viewport={"width": w, "height": h}, locale="th-TH", timezone_id="Asia/Bangkok", is_mobile=mob, has_touch=mob))
    # ---------- 1 & 2: solo ----------
    Sx, s = mk("S"); hook(s, "S"); signup(s, "Solo", ES); create_couple(s, "Solo Couple")
    s.goto(f"{BASE}/dashboard"); s.wait_for_load_state("networkidle")
    paw = s.locator("a[aria-label='ห้องน้อง']").first
    chk("1a mobile header paw icon visible", paw.is_visible(), paw.get_attribute("href"))
    paw.click(); s.wait_for_url(re.compile(r"/room")); s.wait_for_load_state("networkidle"); time.sleep(1)
    chk("1b /room reached via paw", "/room" in s.url, s.url)
    svgs = s.locator("div[aria-hidden=true] svg").count()
    chk("1c room scene svg renders", svgs >= 1, {"svg_in_scene": svgs})
    chk("1d my pet visible", s.locator("button[aria-label='น้องของฉัน']").is_visible())
    picks = s.locator("[role=group][aria-label='เลือกห้อง'] button")
    labs = [picks.nth(i).get_attribute("aria-label") for i in range(picks.count())]
    chk("1e room picker 5 buttons Thai labels", len(labs) == 5 and all(re.search(r"[฀-๿]", l or "") for l in labs), labs)
    s.screenshot(path=f"{SHOT}/solo-room-mobile.png", full_page=True)
    chk("2a solo hint 'ชวนอีกฝ่ายเข้าคู่ในตั้งค่า'", s.locator("text=ชวนอีกฝ่ายเข้าคู่ในตั้งค่า").count() == 1)
    chk("2b hug/miss disabled", s.locator("button:has-text('กอด')").is_disabled() and s.locator("button:has-text('คิดถึง')").is_disabled())
    # desktop side nav
    Dx, d = mk("D", 1280, 860, False); hook(d, "D")
    signup(d, "Desk", f"pd{stamp}@test.dev"); create_couple(d, "Desk Couple"); d.goto(f"{BASE}/dashboard"); d.wait_for_load_state("networkidle")
    sn = d.locator("aside a[href='/room'], nav a[href='/room']:visible").first
    chk("1f desktop side nav link visible", sn.is_visible(), sn.inner_text())
    sn.click(); d.wait_for_url(re.compile(r"/room")); d.wait_for_load_state("networkidle"); time.sleep(1)
    d.screenshot(path=f"{SHOT}/room-desktop.png"); chk("1g desktop /room loads", d.locator("button[aria-label='น้องของฉัน']").is_visible())
    Sx.close(); Dx.close()

    # ---------- pair A,B ----------
    Ax, a = mk("A"); hook(a, "A"); Bx, m = mk("B"); hook(m, "B")
    signup(a, "AA", EA); code = create_couple(a, "Pair QA"); signup(m, "BB", EB); join(m, code)
    cid = dbq("select couple_id c from couple_members where user_id=(select id from users where email=?)", (EA,))[0]["c"]
    uidA = dbq("select id from users where email=?", (EA,))[0]["id"]; uidB = dbq("select id from users where email=?", (EB,))[0]["id"]
    # capture B responses (privacy)
    bodies = []
    def cap(r):
        try:
            if r.request.resource_type in ("document", "fetch", "xhr"): bodies.append((r.url, r.text()))
        except Exception: pass
    m.on("response", cap)
    # ---------- 3 ----------
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1.2)
    chk("3a B sees 'วันนี้ AA ยังไม่ได้แวะมา'", m.locator("text=วันนี้ AA ยังไม่ได้แวะมา").count() == 1)
    chk("3b no partner pet", partner_pet(m, "AA").count() == 0 and bubble(m).count() == 0)
    # ---------- 4 ----------
    a.goto(f"{BASE}/room"); a.wait_for_load_state("networkidle"); time.sleep(1.5)  # A on /room (page a)
    a2 = Ax.new_page(); hook(a2, "A2")
    walked = {"v": False}; samples = []
    t0 = time.time(); add_event(a2, "ดินเนอร์ริมน้ำ")
    def seen_walk():
        if m.locator(".pet-walk-in").count(): walked["v"] = True
        if bubble(m).count(): samples.append(bubble(m).locator("div.max-h-\\[9\\.5rem\\]").inner_text().split("\n")[0])
        return partner_pet(m, "AA").count() and bubble(m).count() and counter(m) == "1/1"
    ok = wait(seen_walk, 15, 0.05)
    for _ in range(25): seen_walk(); time.sleep(0.04)
    chk("4a realtime: A's pet appears on B w/o reload", bool(partner_pet(m, "AA").count()), f"{time.time()-t0:.1f}s")
    chk("4b walk-in animation class observed", walked["v"])
    chk("4c bubble 'ชวนไป' + counter 1/1", bool(ok), {"text": bubble_text(m), "counter": counter(m)})
    chk("4d typing observed (partial text sampled)", any(x and len(x) < len("ชวนไป 'ดินเนอร์ริมน้ำ'") for x in samples[:-1]) if len(samples) > 1 else False, samples[:4])
    m.screenshot(path=f"{SHOT}/B-walkin-bubble-mobile.png")
    # close: wait typing done then click ปิด
    wait(lambda: bubble(m).locator("button:has-text('ปิด')").count(), 8)
    bubble(m).locator("button:has-text('ปิด')").click(); time.sleep(0.4)
    chk("4e 'ปิด' closes bubble", bubble(m).count() == 0)
    time.sleep(1.5)
    m.reload(); m.wait_for_load_state("networkidle"); time.sleep(0.5)
    w2 = m.locator(".pet-walk-in").count(); time.sleep(1.5)
    chk("4f reload: pet standing, no walk-in, no auto bubble", partner_pet(m, "AA").count() == 1 and w2 == 0 and bubble(m).count() == 0, {"walk": w2, "bubble": bubble(m).count()})
    partner_pet(m, "AA").click(); time.sleep(0.4)
    chk("4g tap pet replays instantly", bubble(m).count() == 1 and "ดินเนอร์ริมน้ำ" in (bubble_text(m) or "") and "ดินเนอร์ริมน้ำ" in bubble(m).inner_text(), bubble_text(m))
    bubble(m).locator("button:has-text('ปิด')").click()
    # ---------- 5 privacy ----------
    SECRET = "ลับสุดยอดชาบู9X"; GR = "ขอบคุณเรื่องลับ7Z"
    n0 = len(bodies)
    checkin(a2, 5, 4, SECRET, GR)
    TEASER = "เช็กอินแล้วนะ เธอเช็กอินก่อนแล้วจะบอก 🤫"
    got = wait(lambda: bubble(m).count() and TEASER in (bubble_text(m) or ""), 12)
    chk("5a B (not checked in) sees teaser live", bool(got), bubble_text(m))
    m.screenshot(path=f"{SHOT}/B-teaser-mobile.png")
    m.reload(); m.wait_for_load_state("networkidle"); time.sleep(1.5)
    allb = "\n".join(t for u, t in bodies[n0:])
    chk("5b A's check-in text absent from B HTML/action payloads", SECRET not in allb and GR not in allb and "ลับสุดยอด" not in allb, {"responses": len(bodies) - n0, "bytes": len(allb)})
    moods = re.findall(r'"partner":\{[^}]*?"mood":"(\w+)"', allb)
    chk("5c partner pet mood neutral (happy) while teaser, not 'excited'", bool(moods) and all(x == "happy" for x in moods), moods)
    chk("5c2 server queue item flagged teaser", '"teaser":true' in allb, "")
    checkin(m, 3, 3, "อยากนอน", "ขอบคุณที่รอ")
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1)
    partner_pet(m, "AA").click(); time.sleep(0.5)
    txt = bubble(m).inner_text() if bubble(m).count() else ""
    # step through items to find check-in item
    seen_texts = []
    for _ in range(8):
        if not bubble(m).count(): break
        seen_texts.append(bubble_text(m))
        c = counter(m); 
        if c and c.split("/")[0] == c.split("/")[1]: break
        bubble(m).locator("button:has-text('ต่อไป')").click(); time.sleep(0.3)
    chk("5d after B checks in: real text visible", any(SECRET in (t or "") for t in seen_texts) and not any(TEASER in (t or "") for t in seen_texts), seen_texts)
    ms_ = re.findall(r'partner\\?":\{[^}]*?mood\\?":\\?"(\w+)', m.content()) or re.findall(r'"mood":"(\w+)"', m.content())
    ms_ = [x for x in ms_ if x in ("excited", "love")]
    chk("5e partner mood reflects check-in (excited) after B checks in", bool(ms_), ms_)
    m.screenshot(path=f"{SHOT}/B-checkin-reveal-mobile.png")
    if bubble(m).count():
        for _ in range(8):
            if bubble(m).locator("button:has-text('ปิด')").count(): bubble(m).locator("button:has-text('ปิด')").click(); break
            bubble(m).locator("button:has-text('ต่อไป')").click(); time.sleep(0.2)

    # ---------- 7 notes (before 6 so queue grows) ----------
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1)
    partner_pet(m, "AA").click(); time.sleep(0.3); base_total = int(counter(m).split("/")[1]); bubble(m).locator("button:has-text('ปิด')").count() and None
    def close_bubble(pg):
        for _ in range(15):
            if not bubble(pg).count(): return
            if bubble(pg).locator("button:has-text('ปิด')").count(): bubble(pg).locator("button:has-text('ปิด')").click(); time.sleep(0.2); return
            bubble(pg).locator("button:has-text('ต่อไป')").click(); time.sleep(0.15)
    close_bubble(m)
    add_note(a2, "บันทึกส่วนตัวของ AA", "ความลับ-PRIV", "private")
    time.sleep(2.5); m.reload(); m.wait_for_load_state("networkidle"); time.sleep(1)
    partner_pet(m, "AA").click(); time.sleep(0.4)
    chk("7a private note adds nothing to B's queue", int(counter(m).split("/")[1]) == base_total and "PRIV" not in m.content(), {"before": base_total, "after": counter(m)})
    close_bubble(m)
    add_note(a2, "เดตที่อารีย์", "ร้านกาแฟ")
    time.sleep(1); m.reload(); m.wait_for_load_state("networkidle"); time.sleep(2.5)
    bb = bubble_text(m)
    chk("7b shared note appears in B's queue (auto-open as unseen)", bubble(m).count() == 1 and "เดตที่อารีย์" in (bb or ""), {"text": bb, "counter": counter(m)})
    close_bubble(m)

    # ---------- 6 queue controls ----------
    a2.goto(f"{BASE}/lists"); a2.click("text=ของที่ต้องซื้อ"); a2.wait_for_url(re.compile(r"/lists/"))
    add_event(a2, "ปิกนิกสวนสาธารณะ")
    time.sleep(1); m.reload(); m.wait_for_load_state("networkidle"); time.sleep(2.5)
    # now there is ≥4 items; 1 unseen auto-opened. replay for controls
    close_bubble(m)
    partner_pet(m, "AA").click(); time.sleep(0.4)
    tot = int(counter(m).split("/")[1])
    chk("6a ≥3 items in queue", tot >= 3, counter(m))
    c0 = counter(m); bubble(m).locator("button:has-text('ต่อไป')").click(); time.sleep(0.3); c1 = counter(m)
    bubble(m).locator("button:has-text('ย้อนกลับ')").click(); time.sleep(0.3); c2 = counter(m)
    chk("6b next/back/counter work", c0 == f"1/{tot}" and c1 == f"2/{tot}" and c2 == f"1/{tot}", [c0, c1, c2])
    chk("6c back disabled at 1/N", bubble(m).locator("button:has-text('ย้อนกลับ')").is_disabled())
    m.screenshot(path=f"{SHOT}/B-queue-controls-mobile.png")
    time.sleep(10.5); c3 = counter(m)
    chk("6d back pauses auto-advance (still 1/N after 10.5 s)", c3 == c2, c3)
    close_bubble(m)
    partner_pet(m, "AA").click(); time.sleep(0.3); bubble(m).locator("button:has-text('ต่อไป')").click(); time.sleep(0.2); cA = counter(m)
    time.sleep(9.5); cB = counter(m)
    chk("6e (control) without back, auto-advances after ~8s", cA != cB or cB is None or cB.split('/')[0] != cA.split('/')[0], [cA, cB])
    close_bubble(m)
    m.reload(); m.wait_for_load_state("networkidle"); time.sleep(2.5)
    chk("6f seen items persist across reload (no auto bubble)", bubble(m).count() == 0, "")

    # ---------- 8 room ----------
    a.bring_to_front(); a.goto(f"{BASE}/room"); a.wait_for_load_state("networkidle"); time.sleep(1.5)
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1.5)
    close_bubble(m)
    star = "ห้องดูดาว"
    before = m.locator("div[aria-hidden=true] svg").first.inner_html()
    a.locator(f"button[aria-label='{star}']").click()
    ok = wait(lambda: m.locator(f"button[aria-label='{star}']").get_attribute("aria-pressed") == "true", 10)
    after = m.locator("div[aria-hidden=true] svg").first.inner_html()
    chk("8a B's room changes live", bool(ok) and before != after, {"pressed": bool(ok), "svg_changed": before != after})
    m.screenshot(path=f"{SHOT}/B-stargaze-mobile.png")
    m.reload(); m.wait_for_load_state("networkidle"); time.sleep(1)
    chk("8b persists after reload (B and DB)", m.locator(f"button[aria-label='{star}']").get_attribute("aria-pressed") == "true" and dbq("select room from couples where id=?", (cid,))[0]["room"] == "stargaze", dbq("select room from couples where id=?", (cid,)))

    # ---------- 9 hug ----------
    close_bubble(m)
    a.locator("button:has-text('กอด')").click(); time.sleep(0.8)
    n_hug = dbq("select count(*) n from activity_feed where couple_id=? and kind='hug'", (cid,))[0]["n"]
    got = wait(lambda: bubble(m).count() and counter(m), 10)
    chk("9a hug creates activity + B sees live", n_hug == 1 and bool(got), {"hug_rows": n_hug, "B_bubble": bubble_text(m)})
    m.screenshot(path=f"{SHOT}/B-hug-mobile.png")
    a.locator("button:has-text('กอด')").click(); time.sleep(0.8)
    msg = a.locator("p[role=status]").inner_text()
    chk("9b second hug <60s -> 'รออีก N วินาทีนะ'", re.search(r"รออีก \d+ วินาทีนะ", msg) is not None, msg)
    chk("9c no extra hug row", dbq("select count(*) n from activity_feed where couple_id=? and kind='hug'", (cid,))[0]["n"] == 1)
    a.locator("button:has-text('คิดถึง')").click(); time.sleep(0.8)
    a.locator("button:has-text('คิดถึง')").click(); time.sleep(0.8)
    chk("9d miss: first ok, second rate-limited", dbq("select count(*) n from activity_feed where couple_id=? and kind='miss'", (cid,))[0]["n"] == 1 and "รออีก" in a.locator("p[role=status]").inner_text())
    close_bubble(m)

    # ---------- 10 treats ----------
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1); close_bubble(m)
    t_before = treats(m)
    a2.goto(f"{BASE}/lists"); a2.click("text=ของที่ต้องซื้อ"); a2.wait_for_url(re.compile(r"/lists/")); a2.wait_for_load_state("networkidle")
    for i in range(7):
        a2.fill("input[name=text]", f"ของ{i}"); a2.click("button:has-text('เพิ่ม')"); a2.wait_for_load_state("networkidle"); time.sleep(0.3)
    m.goto(f"{BASE}/lists"); m.click("text=ของที่ต้องซื้อ"); m.wait_for_url(re.compile(r"/lists/")); m.wait_for_load_state("networkidle"); lurl = m.url
    def complete_one(pg):
        pg.locator("button[aria-label='ทำเสร็จแล้ว']").first.click(); pg.wait_for_load_state("networkidle"); time.sleep(0.6)
    complete_one(m)
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1); close_bubble(m)
    chk("10a B completes 1 item -> treat badge 1", t_before == 0 and treats(m) == 1, {"before": t_before, "after": treats(m)})
    m.screenshot(path=f"{SHOT}/B-treat-badge-mobile.png")
    m.locator("button:has-text('ป้อนขนม')").click(); time.sleep(0.3)
    m.locator("button:has-text('ป้อนน้องของ AA')").click(); time.sleep(1.0)
    chk("10b feed partner -> badge 0", treats(m) == 0, treats(m))
    got = wait(lambda: "ป้อนขนมให้น้อง 🍪" in (bubble_text(a) or ""), 10)
    a.bring_to_front()
    chk("10c A sees 'ป้อนขนมให้น้อง 🍪' live", bool(got), bubble_text(a))
    a.screenshot(path=f"{SHOT}/A-treat-received-mobile.png")
    for i in range(5):
        m.goto(lurl); m.wait_for_load_state("networkidle"); complete_one(m)
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1); close_bubble(m)
    u = dbq("select treats, treats_today, treats_day from users where id=?", (uidB,))[0]
    done = dbq("select count(*) n from list_items where completed_by=?", (uidB,)) if False else None
    chk("10d complete 6 items total -> max 5 earned today", treats(m) == 4 and u["treats_today"] == 5, {"badge": treats(m), "db": u})

    # ---------- 11 memory ----------
    ly = (clock.date().replace(year=clock.year - 1))
    eid = "qaev" + stamp
    dbq("insert into events (id, couple_id, title, start_at, all_day, remind_before, created_by) values (?,?,?,?,0,'d1',?)",
        (eid, cid, "ทะเลหัวหิน", f"{ly.isoformat()}T05:00:00.000Z", uidA))
    for pg, nm in ((m, "B"),):
        pg.goto(f"{BASE}/room"); pg.wait_for_load_state("networkidle"); time.sleep(1.5)
        mem = pg.locator("aside[aria-label='ปีที่แล้ววันนี้']")
        chk(f"11a {nm}: 'ปีที่แล้ววันนี้' bubble shown", mem.count() == 1 and "ทะเลหัวหิน" in mem.inner_text(), mem.inner_text() if mem.count() else None)
        pg.screenshot(path=f"{SHOT}/B-memory-mobile.png"); time.sleep(1.5)
        pg.reload(); pg.wait_for_load_state("networkidle"); time.sleep(1.5)
        chk(f"11b {nm}: not shown after reload", pg.locator("aside[aria-label='ปีที่แล้ววันนี้']").count() == 0)
    a.goto(f"{BASE}/room"); a.wait_for_load_state("networkidle"); time.sleep(1.5)
    chk("11c A (other viewer) also sees it once", a.locator("aside[aria-label='ปีที่แล้ววันนี้']").count() == 1)

    # ---------- 12 ws ----------
    def raw(req):
        s_ = socket.create_connection(("localhost", 4174), timeout=8); s_.sendall(req.encode()); data = b""
        try:
            while b"\r\n\r\n" not in data:
                ch = s_.recv(4096)
                if not ch: break
                data += ch
        except Exception: pass
        s_.close(); return data.split(b"\r\n")[0].decode(errors="replace")
    wsr = raw("GET /api/room/ws HTTP/1.1\r\nHost: localhost:4174\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n")
    chk("12a unauth WS rejected (not 101)", "101" not in wsr and wsr != "", wsr)
    g = raw("GET /api/room/poke HTTP/1.1\r\nHost: localhost:4174\r\nConnection: close\r\n\r\n")
    po = raw("POST /api/room/poke HTTP/1.1\r\nHost: localhost:4174\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}")
    chk("12b /api/room/poke is 404", " 404" in g and " 404" in po, [g, po])

    # ---------- 13 regressions ----------
    for path in ("/dashboard", "/calendar", "/lists", "/checkin", "/notes", "/plans", "/settings", "/room"):
        for pg, t in ((a, "A"), (m, "B")):
            r = pg.goto(f"{BASE}{path}"); pg.wait_for_load_state("networkidle")
            if not (r and r.status < 400): chk(f"13 {t} {path}", False, r.status if r else None)
    chk("13a pages load for A & B (8 routes)", not [x for x in res if x[0].startswith("13 ") and not x[1]])
    a.goto(f"{BASE}/room"); a.wait_for_load_state("networkidle"); time.sleep(1); a.screenshot(path=f"{SHOT}/A-room-final-mobile.png", full_page=True)
    chk("13b no console/page errors", not errors, errors[:6])
    chk("13c no 5xx responses", not bad, bad[:6])
    b.close()
print("\nSUMMARY:", sum(1 for r in res if r[1]), "pass /", len(res))
for r in res:
    if not r[1]: print("FAILED:", r[0], "|", str(r[2])[:300])
