"""QA round 2: P3A review-fix checks. Run vs vite preview :4174 of a QA copy.  python3 pet_ui_r2_test.py [qa_dir]"""
import re, sys, time, glob, sqlite3, json
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4174"; ROOT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/duo-qa"
SHOT = "/home/claude/p3-assets/qa"; BKK = timezone(timedelta(hours=7))
stamp = str(int(time.time())); PW = "password123"
res = []; errors = []; bad = []
def chk(name, ok, ev=""):
    res.append((name, ok, ev)); print("PASS" if ok else "FAIL", name, "|", str(ev)[:500], flush=True)
def dbq(sql, args=()):
    f = [x for x in glob.glob(f"{ROOT}/.cloudflare/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite") if "metadata" not in x][0]
    c = sqlite3.connect(f, timeout=20); c.row_factory = sqlite3.Row
    try:
        r = [dict(x) for x in c.execute(sql, args).fetchall()]; c.commit(); return r
    finally: c.close()
def hook(page, tag):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror {e}"))
    page.on("console", lambda m: m.type in ("error", "warning") and errors.append(f"{tag} console.{m.type} {m.text[:200]}"))
    page.on("response", lambda r: r.status >= 500 and bad.append(f"{tag} {r.status} {r.url}"))
def signup(page, name, email):
    page.goto(f"{BASE}/signup"); page.fill("#name", name); page.fill("#email", email); page.fill("#password", PW)
    page.click("button[type=submit]"); page.wait_for_url(re.compile(r"/onboarding"))
def create_couple(page, name):
    page.fill("#name", name); page.fill("#anniversary", "2023-02-14")
    page.locator("form").first.locator("button[type=submit]").click(); page.wait_for_url(re.compile(r"/calendar"))
    page.goto(f"{BASE}/settings"); return page.locator("code.font-mono").first.inner_text().strip()
def join(page, code):
    page.locator("#code").fill(code); page.locator("form").nth(1).locator("button[type=submit]").click(); page.wait_for_url(re.compile(r"/calendar"))
G = "[role=group][aria-label^='ข้อความจาก']"
def bubble(pg): return pg.locator(G)
def counter(pg):
    l = pg.locator(G + " span.tabular-nums span[aria-hidden]"); return l.inner_text().strip() if l.count() else None
def btext(pg):
    l = bubble(pg); return l.locator("p.sr-only").inner_text().strip() if l.count() else None
def ppet(pg, name): return pg.locator(f"button[aria-label^='น้องของ {name}']")
def wait(fn, t=10, step=0.25):
    end = time.time() + t
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(step)
    return None
def close_bubble(pg):
    for _ in range(20):
        if not bubble(pg).count(): return
        if bubble(pg).locator("button:has-text('ปิด')").count(): bubble(pg).locator("button:has-text('ปิด')").click(); time.sleep(0.2); return
        bubble(pg).locator("button:has-text('ต่อไป')").click(); time.sleep(0.12)
def read_queue(pg, name):
    """reload /room, replay all items, return texts"""
    pg.goto(f"{BASE}/room"); pg.wait_for_load_state("networkidle"); time.sleep(3.2); close_bubble(pg)
    ppet(pg, name).click(); time.sleep(0.5); out = []
    for _ in range(20):
        if not bubble(pg).count(): break
        out.append(btext(pg))
        n = bubble(pg).locator("button:has-text('ต่อไป')")
        if not n.count(): break
        n.click(); time.sleep(0.12)
    close_bubble(pg); return out
def treats(pg):
    l = pg.locator("button:has-text('ป้อนขนม') span[aria-hidden]")
    return int(re.search(r"\d+", l.first.inner_text()).group()) if l.count() else None
def checkin(pg, mood, energy, need=None, grat=None):
    pg.goto(f"{BASE}/checkin")
    pg.locator(f"label:has(input[name=mood][value='{mood}'])").click(); pg.locator(f"label:has(input[name=energy][value='{energy}'])").click()
    if need: pg.fill("#need", need)
    if grat: pg.fill("#gratitude", grat)
    pg.click("button:has-text('เช็กอิน')"); pg.wait_for_load_state("networkidle"); time.sleep(0.8)
def add_event(pg, title):
    pg.goto(f"{BASE}/calendar"); pg.fill("#title", title); pg.fill("#time", "19:00"); pg.fill("#endTime", "21:00")
    pg.click("text=บันทึกนัด"); pg.wait_for_load_state("networkidle"); time.sleep(0.5)
def add_note(pg, title, body, vis=None):
    pg.goto(f"{BASE}/notes/new"); pg.fill("input[name=title]", title); pg.fill("textarea[name=body]", body)
    if vis: pg.select_option("#visibility", vis)
    pg.click("button:has-text('บันทึก')"); pg.wait_for_url(re.compile(r"saved=1")); time.sleep(0.5)
def capture(pg, trigger):
    with pg.expect_request(lambda r: r.method == "POST" and "next-action" in {k.lower() for k in r.headers}, timeout=15000) as ri:
        trigger()
    r = ri.value; return {"url": r.url, "headers": r.headers, "body": r.post_data}
def replay_many(pg, cap, bodies):
    """fire len(bodies) fetches concurrently inside the page; returns response texts"""
    return pg.evaluate("""async ([cap, bodies]) => {
      const h = {}; for (const [k, v] of Object.entries(cap.headers)) if (!['content-length','host','cookie','origin','referer','user-agent','connection'].includes(k.toLowerCase()) && !k.startsWith(':')) h[k] = v;
      return await Promise.all(bodies.map(b => fetch(cap.url, {method: 'POST', headers: h, body: b, credentials: 'include'}).then(r => r.text())));
    }""", [cap, bodies])

WSINIT = """(() => { const O = window.WebSocket; window.__ws = []; window.WebSocket = function(u, p) { const w = p ? new O(u, p) : new O(u); const rec = {url: String(u), t: Date.now(), open: false, code: null};
  window.__ws.push(rec); w.addEventListener('open', () => rec.open = true); w.addEventListener('close', e => rec.code = e.code); return w; }; window.WebSocket.prototype = O.prototype;
  for (const k of ['CONNECTING','OPEN','CLOSING','CLOSED']) window.WebSocket[k] = O[k]; })();"""

clock = datetime.now(BKK); print("RUN CLOCK (Bangkok):", clock.isoformat(), flush=True)
EA = f"qa{stamp}@test.dev"; EB = f"qb{stamp}@test.dev"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    mk = lambda w=390, h=844, mob=True: (lambda c: (c, c.new_page()))(b.new_context(viewport={"width": w, "height": h}, locale="th-TH", timezone_id="Asia/Bangkok", is_mobile=mob, has_touch=mob))
    Ax, a = mk(); Bx, m = mk()
    for c_ in (Ax, Bx): c_.add_init_script(WSINIT)
    hook(a, "A"); hook(m, "B")
    signup(a, "AA", EA); code = create_couple(a, "R2 QA"); signup(m, "BB", EB); join(m, code)
    cid = dbq("select couple_id c from couple_members where user_id=(select id from users where email=?)", (EA,))[0]["c"]
    uidA = dbq("select id from users where email=?", (EA,))[0]["id"]; uidB = dbq("select id from users where email=?", (EB,))[0]["id"]
    a2 = Ax.new_page(); hook(a2, "A2"); m2 = Bx.new_page(); hook(m2, "B2")

    # ===== R2-1 teaser -> real =====
    SEC = "ความลับของบีB77"
    a.goto(f"{BASE}/room"); a.wait_for_load_state("networkidle"); time.sleep(1.5)
    checkin(m2, 4, 3, SEC, "ขอบคุณ-B88")
    TEASER = "เช็กอินแล้วนะ เธอเช็กอินก่อนแล้วจะบอก 🤫"
    got = wait(lambda: bubble(a).count() and TEASER in (btext(a) or ""), 14)
    chk("R1a A (not checked in) sees teaser live", bool(got), btext(a))
    time.sleep(2.0)  # let seen flush
    a.screenshot(path=f"{SHOT}/r2-A-teaser-mobile.png")
    seen_rows = dbq("select item_id from pet_seen where user_id=?", (uidA,))
    a.reload(); a.wait_for_load_state("networkidle"); time.sleep(3.5)
    chk("R1b teaser marked seen: no auto-open on reload", bubble(a).count() == 0, {"seen_rows": seen_rows})
    a.goto(f"{BASE}/dashboard"); a.wait_for_load_state("networkidle")
    checkin(a2, 5, 4, "ของA", "ขอบคุณA")
    a.goto(f"{BASE}/room"); a.wait_for_load_state("networkidle")
    got = wait(lambda: bubble(a).count() and SEC in (btext(a) or ""), 10)
    chk("R1c after A checks in + reload: B's pet auto-plays REAL text (unseen)", bool(got) and TEASER not in (btext(a) or ""), btext(a))
    a.screenshot(path=f"{SHOT}/r2-A-real-checkin-mobile.png")
    close_bubble(a)

    # ===== hug capture (start 60s clock) =====
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1)  # B on room for realtime
    a.goto(f"{BASE}/room"); a.wait_for_load_state("networkidle"); time.sleep(1.5); close_bubble(a)
    hug_cap = capture(a, lambda: a.locator("button:has-text('กอด')").click()); t_hug = time.time()
    time.sleep(1)

    # ===== R2-2 live text: edit / delete / private =====
    close_bubble(m)
    add_event(a2, "ปาร์ตี้E1"); add_note(a2, "โน้ตN1", "เนื้อหาแรก")
    q = read_queue(m, "AA")
    chk("R2a B narrates created event + shared note", any("ปาร์ตี้E1" in t for t in q) and any("โน้ตN1" in t and "เนื้อหาแรก" in t for t in q), q)
    nid = dbq("select id from notes where title='โน้ตN1' and couple_id=?", (cid,))[0]["id"]
    a2.goto(f"{BASE}/notes/{nid}"); a2.fill("textarea[name=body]", "เนื้อหาแก้ไขแล้ว"); a2.click("button:has-text('บันทึก')"); a2.wait_for_load_state("networkidle"); time.sleep(1)
    a2.goto(f"{BASE}/calendar"); a2.wait_for_load_state("networkidle")
    row = a2.locator("li:has-text('ปาร์ตี้E1')").first
    row.locator("button[aria-label='ลบ']").click(); a2.wait_for_load_state("networkidle"); time.sleep(1)
    chk("R2-pre event deleted in DB", dbq("select count(*) n from events where title='ปาร์ตี้E1' and couple_id=?", (cid,))[0]["n"] == 0)
    q = read_queue(m, "AA")
    chk("R2b edited note text shown (new body, old body gone)", any("เนื้อหาแก้ไขแล้ว" in t for t in q) and not any("เนื้อหาแรก" in t for t in q), q)
    chk("R2c deleted event no longer narrated", not any("ปาร์ตี้E1" in t for t in q), q)
    m.screenshot(path=f"{SHOT}/r2-B-queue-after-edit-mobile.png")
    a2.goto(f"{BASE}/notes/{nid}"); a2.select_option("#visibility", "private"); a2.click("button:has-text('บันทึก')"); a2.wait_for_load_state("networkidle"); time.sleep(1)
    q = read_queue(m, "AA")
    chk("R2d note made private disappears from B's queue", not any("โน้ตN1" in t or "เนื้อหาแก้ไข" in t for t in q), q)

    # ===== R2-3 treat farming =====
    a2.goto(f"{BASE}/lists"); a2.click("text=ของที่ต้องซื้อ"); a2.wait_for_url(re.compile(r"/lists/")); a2.wait_for_load_state("networkidle")
    for t_ in ("farm1", "farm2", "farm3"):
        a2.fill("input[name=text]", t_); a2.click("button:has-text('เพิ่ม')"); a2.wait_for_load_state("networkidle"); time.sleep(0.3)
    m.goto(f"{BASE}/lists"); m.click("text=ของที่ต้องซื้อ"); m.wait_for_url(re.compile(r"/lists/")); m.wait_for_load_state("networkidle"); lurl = m.url
    t0_ = dbq("select treats, treats_today from users where id=?", (uidB,))[0]
    first_cap = None
    for i in range(5):
        li = m.locator("li:has-text('farm1')").first
        if i == 0: first_cap = capture(m, lambda: li.locator("button[aria-label='ทำเสร็จแล้ว']").click())
        else: li.locator("button[aria-label='ทำเสร็จแล้ว']").click()
        m.wait_for_load_state("networkidle"); time.sleep(0.5)
        m.locator("li:has-text('farm1')").first.locator("button[aria-label='ยกเลิกเสร็จ']").click(); m.wait_for_load_state("networkidle"); time.sleep(0.5)
    u1 = dbq("select treats, treats_today from users where id=?", (uidB,))[0]
    chk("R3a toggle done/undone x5 -> treats +1 exactly", u1["treats"] - t0_["treats"] == 1 and u1["treats_today"] - t0_["treats_today"] == 1, {"before": t0_, "after": u1})
    ids = dbq("select id,text from list_items where text in ('farm2','farm3') and couple_id=?", (cid,)); idm = {r["text"]: r["id"] for r in ids}
    id1 = dbq("select id from list_items where text='farm1' and couple_id=?", (cid,))[0]["id"]
    print("DBG toggle body:", first_cap["body"][:300].replace("\n", "\\n"), flush=True)
    bodies = [first_cap["body"].replace(id1, idm["farm2"])] * 2
    outs = replay_many(m, first_cap, bodies); time.sleep(1)
    u2 = dbq("select treats, treats_today from users where id=?", (uidB,))[0]
    done2 = dbq("select done from list_items where id=?", (idm["farm2"],))[0]["done"]
    chk("R3b two concurrent completes of same item -> treats +1 exactly", done2 == 1 and u2["treats"] - u1["treats"] == 1, {"before": u1, "after": u2, "done": done2})

    # ===== R2-6 treat target (B has ≥2 treats) =====
    m.goto(f"{BASE}/room"); m.wait_for_load_state("networkidle"); time.sleep(1.5); close_bubble(m)
    a.goto(f"{BASE}/room"); a.wait_for_load_state("networkidle"); time.sleep(3.5); close_bubble(a)
    def chomp_probe(pg, secs=6):
        seen = {"me": False, "partner": False}; end = time.time() + secs
        while time.time() < end:
            if pg.locator("button[aria-label='น้องของฉัน'].pet-b-chomp").count(): seen["me"] = True
            if pg.locator("button[aria-label^='น้องของ BB'].pet-b-chomp").count(): seen["partner"] = True
            if seen["me"] or seen["partner"]: break
            time.sleep(0.05)
        return seen
    tb = treats(m)
    m.locator("button:has-text('ป้อนขนม')").click(); time.sleep(0.3); m.locator("button:has-text('ป้อนน้องของ AA')").click()
    r1 = chomp_probe(a)
    a.screenshot(path=f"{SHOT}/r2-A-pet-fed-by-B-mobile.png")
    chk("R6a B feeds A's pet -> on A's screen MY pet chomps (not partner)", r1["me"] and not r1["partner"], r1)
    time.sleep(2.5); close_bubble(a)
    m.locator("button:has-text('ป้อนขนม')").click(); time.sleep(0.3); m.locator("button:has-text('ป้อนน้องของฉัน')").click()
    r2 = chomp_probe(a)
    chk("R6b B feeds own pet -> on A's screen B's pet (partner) chomps, not mine", r2["partner"] and not r2["me"], r2)
    time.sleep(2.5); close_bubble(a)

    # ===== R2-4 concurrent hugs =====
    wait_s = 63 - (time.time() - t_hug)
    if wait_s > 0: time.sleep(wait_s)
    before = dbq("select count(*) n from activity_feed where couple_id=? and user_id=? and kind='hug'", (cid, uidA))[0]["n"]
    outs = replay_many(a, hug_cap, [hug_cap["body"], hug_cap["body"]]); time.sleep(0.8)
    after = dbq("select count(*) n from activity_feed where couple_id=? and user_id=? and kind='hug'", (cid, uidA))[0]["n"]
    nret = sum(1 for o in outs if "retryAfter" in o)
    chk("R4 2 concurrent hugAction -> exactly one succeeds, other retryAfter", after - before == 1 and nret == 1, {"new_rows": after - before, "retryAfter_responses": nret, "snips": [o[:120] for o in outs]})

    # ===== R2-5 markSeen forgery =====
    m.goto(f"{BASE}/dashboard"); m.wait_for_load_state("networkidle"); time.sleep(1)
    # fresh unseen item to trigger a real markSeen call
    add_event(a2, "ชวนดูหนังR5"); time.sleep(0.5)
    ms_cap = {}
    def trig():
        m.goto(f"{BASE}/room")
    try:
        ms_cap = capture(m, trig)
    except Exception as e:
        print("capture markSeen err", e)
    print("DBG markSeen body:", (ms_cap.get("body") or "")[:300], flush=True)
    rid = re.findall(r'"([0-9a-f-]{36})"', ms_cap.get("body") or "")
    other = dbq("select id from activity_feed where couple_id!=? limit 1", (cid,))
    olddate = "2020-01-01"; oldid = "old-" + stamp
    dbq("insert into activity_feed (id, couple_id, user_id, kind, text, day) values (?,?,?,?,?,?)", (oldid, cid, uidA, "event", "เก่า", olddate))
    treat_id = "treat:" + (rid[0] if rid else "x")
    # also a real treat-activity of A? use legit foreign
    forged = [("foreign", other[0]["id"] if other else "foreign-none"), ("old", oldid), ("treat", treat_id), ("treatx", "treat:forged-xyz")]
    before_rows = {r["item_id"] for r in dbq("select item_id from pet_seen where user_id=?", (uidB,))}
    base_body = ms_cap.get("body") or "[[]]"
    for nm, fid in forged:
        body = json.dumps([[fid]]) if not rid else base_body.replace(rid[0], fid)
        replay_many(m, ms_cap, [body]); time.sleep(0.3)
    after_rows = {r["item_id"] for r in dbq("select item_id from pet_seen where user_id=?", (uidB,))}
    leaked = [(nm, fid) for nm, fid in forged if fid in after_rows]
    # positive control: legit id works
    ctl_body = base_body
    chk("R5 markSeen with foreign/old/treat:* ids ignored (no pet_seen rows)", ms_cap and not leaked, {"leaked": leaked, "new_rows": sorted(after_rows - before_rows)[:5], "replayed_via": "real captured action" if rid else "synthetic body"})

    # ===== R2-7 realtime auth =====
    anon = b.new_context(); an = anon.new_page(); an.add_init_script(WSINIT); an.goto(f"{BASE}/login")
    r = an.evaluate("""()=>new Promise(res=>{const w=new WebSocket(`ws://${location.host}/api/room/ws`);let o=false;w.onopen=()=>o=true;w.onclose=e=>res({open:o,code:e.code})})""")
    chk("R7a logged-out WebSocket close code", r["code"] in (4401, 1006) and not r["open"] or r.get("code") == 4401, r)
    code4401 = r["code"] == 4401
    print("INFO logged-out close code:", r["code"], "(4401 exact:" , code4401, ")", flush=True)
    # logged-in page whose session disappears: simulate hide/show
    Cx = b.new_context(viewport={"width": 390, "height": 844}, locale="th-TH"); Cx.add_init_script(WSINIT)
    c = Cx.new_page(); hook(c, "C"); c.goto(f"{BASE}/login"); c.fill("#email", EA); c.fill("#password", PW); c.click("button[type=submit]"); c.wait_for_url(re.compile("/calendar"))
    c.goto(f"{BASE}/room"); c.wait_for_load_state("networkidle"); time.sleep(1.5)
    first = c.evaluate("window.__ws.map(w=>({open:w.open,code:w.code}))")
    chk("R7b logged-in A opens socket", any(w["open"] for w in first), first)
    Cx.clear_cookies()
    vis = lambda s: c.evaluate("s=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>s});document.dispatchEvent(new Event('visibilitychange'))}", s)
    n0 = len(c.evaluate("window.__ws")); vis("hidden"); time.sleep(0.5); vis("visible")
    time.sleep(20)
    ws_all = c.evaluate("window.__ws.map(w=>({open:w.open,code:w.code}))"); newc = ws_all[n0:]
    chk("R7c session gone: socket closed 4401 and ≤2 socket requests in 20 s, then stops", len(newc) <= 2 and any(w["code"] == 4401 for w in newc), newc)
    Cx.close(); anon.close()
    bodies_ = [e for e in errors if "hydrat" in e.lower() or "did not match" in e.lower()]
    chk("R7d no hydration warnings in console on /room (A,B,C)", not bodies_, bodies_[:3])

    # ===== R2-8 layout =====
    mem_id = "r2mem" + stamp; ly = clock.date().replace(year=clock.year - 1)
    dbq("insert into events (id, couple_id, title, start_at, all_day, remind_before, created_by) values (?,?,?,?,0,'d1',?)", (mem_id, cid, "ทะเลหัวหินR2", f"{ly.isoformat()}T05:00:00.000Z", uidA))
    a.goto(f"{BASE}/dashboard"); m.goto(f"{BASE}/dashboard")
    def overlap(r1, r2): return not (r1["x"] + r1["width"] <= r2["x"] or r2["x"] + r2["width"] <= r1["x"] or r1["y"] + r1["height"] <= r2["y"] or r2["y"] + r2["height"] <= r1["y"])
    for (w, h, who, tag, name) in ((390, 844, "B", "mobile", "AA"), (1280, 800, "A", "desktop", "BB")):
        uid_ = uidB if who == "B" else uidA
        dbq("delete from pet_seen where user_id=? and item_id like 'memory:%'", (uid_,))
        # unseen partner item for viewer
        other_ctx = a2 if who == "B" else m2
        add_event(other_ctx, f"ชวนเลย{tag}"); time.sleep(0.5)
        vx = b.new_context(viewport={"width": w, "height": h}, locale="th-TH", timezone_id="Asia/Bangkok", is_mobile=(tag == "mobile"), has_touch=(tag == "mobile")); v = vx.new_page(); hook(v, "V" + tag)
        v.goto(f"{BASE}/login"); v.fill("#email", EB if who == "B" else EA); v.fill("#password", PW); v.click("button[type=submit]"); v.wait_for_url(re.compile("/calendar"))
        v.goto(f"{BASE}/room"); v.wait_for_load_state("networkidle")
        both = False; bm = bs = None; end = time.time() + 14
        while time.time() < end:
            mb = v.locator("aside[aria-label='ปีที่แล้ววันนี้']"); sb = bubble(v)
            if mb.count() == 1 and sb.count() == 1:
                time.sleep(0.5); bm = mb.bounding_box(); bs = sb.bounding_box(); both = bm is not None and bs is not None; break
            time.sleep(0.1)
        mb = v.locator("aside[aria-label='ปีที่แล้ววันนี้']"); sb = bubble(v)
        v.screenshot(path=f"{SHOT}/r2-{tag}-memory-and-bubble.png")
        chk(f"R8a {tag}: both bubbles visible and bboxes do not overlap", both and not overlap(bm, bs), {"memory": bm, "speech": bs})
        # in viewport sanity
        vp = v.viewport_size
        chk(f"R8b {tag}: bubbles inside viewport/scene", both and bs["x"] >= 0 and bs["x"] + bs["width"] <= vp["width"] and bm["x"] >= 0, {"vp": vp})
        live = sb.locator("[aria-live]").count() if sb.count() else None
        role_ = sb.get_attribute("role") if sb.count() else None
        chk(f"R8c {tag}: speech bubble role=group, single aria-live", role_ == "group" and live == 1, {"role": role_, "aria_live_count": live})
        v.keyboard.press("Escape"); time.sleep(0.4)
        chk(f"R8d {tag}: Escape closes speech bubble", bubble(v).count() == 0)
        vx.close()
    chk("R9 no 5xx", not bad, bad[:5])
    errs = [e for e in errors if "console.warning" not in e or "hydrat" in e.lower()]
    chk("R9b console/page errors", not errs, errs[:6])
    b.close()
print("\nSUMMARY:", sum(1 for r in res if r[1]), "pass /", len(res))
for r in res:
    if not r[1]: print("FAILED:", r[0], "|", str(r[2])[:400])
