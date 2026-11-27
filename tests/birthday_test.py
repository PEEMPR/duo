"""QA: birthday feature. Run against vite preview on :4174 of a QA copy with VAPID keys.
Usage: python3 birthday_test.py [duo_qa_dir]   (default /home/claude/duo-qa)
"""
import re, sys, time, glob, sqlite3, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4174"
ROOT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/duo-qa"
BKK = timezone(timedelta(hours=7))
stamp = str(int(time.time())); PW = "password123"
EA = f"ba{stamp}@test.dev"; EB = f"bb{stamp}@test.dev"; EF = f"bf{stamp}@test.dev"; EC = f"bc{stamp}@test.dev"
res = []; errors = []; bad = []
def chk(name, ok, ev): res.append((name, ok, ev)); print("PASS" if ok else "FAIL", name, "|", ev, flush=True)

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

def signup(page, name, email, bday=None):
    page.goto(f"{BASE}/signup")
    page.fill("#name", name); page.fill("#email", email); page.fill("#password", PW)
    if bday is not None: page.fill("#birthday", bday)
    page.click("button[type=submit]")

def cron(dt):
    ms = int(dt.timestamp() * 1000)
    urllib.request.urlopen(f"{BASE}/cdn-cgi/local/scheduled?cron=*+*+*+*+*&time={ms}", timeout=30).read(); time.sleep(2.5)
def L(d, hm): h, mi = map(int, hm.split(":")); return datetime(d.year, d.month, d.day, h, mi, tzinfo=BKK)
def logs(): return [r for r in dbq("select user_id, ref from notification_log where kind='birthday'") if r['user_id'] in MINE]
MINE = set()
def uid(email): return dbq("select id from users where email=?", (email,))[0]["id"]
def ubd(email): return dbq("select birthday, show_birthday from users where email=?", (email,))[0]

def save_bday(page, date, show=True):
    page.goto(f"{BASE}/settings"); page.fill("#birthday", date)
    cb = page.locator("input[name=showBirthday]"); cb.set_checked(show)
    page.locator("button:has-text('บันทึกวันเกิด')").click(); page.wait_for_load_state("networkidle"); time.sleep(0.8)

def cakes(page, d, m=None):
    page.goto(f"{BASE}/calendar?d={d}" + (f"&m={m}" if m else "")); time.sleep(0.5)
    return page.locator("svg[aria-label^='วันเกิด']").count()
def day_cell_has_cake(page, d):
    return page.locator(f"a[href$='d={d}'] svg[aria-label^='วันเกิด']").count()
def sel_rows(page): return [t.strip() for t in page.locator("li:has(svg[aria-label=วันเกิด]) p.font-medium").all_inner_texts()]

today = datetime.now(BKK).date()
D1 = today + timedelta(days=10); D2 = today + timedelta(days=12); D3 = today + timedelta(days=14)
bd = lambda d, y: f"{y}-{d.month:02d}-{d.day:02d}"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    mk = lambda tag: (lambda c: (c, c.new_page()))(b.new_context(locale="th-TH", timezone_id="Asia/Bangkok"))
    # ---- 1 ----
    Cx, c = mk("C"); hook(c, "C")
    c.goto(f"{BASE}/signup"); lab = c.locator("label[for=birthday]").inner_text().strip(); typ = c.locator("#birthday").get_attribute("type"); req = c.locator("#birthday").get_attribute("required")
    chk("1a signup has optional date field", "วันเกิด (ไม่ใส่ก็ได้)" in lab and typ == "date" and req is None, {"label": lab, "type": typ, "required": req})
    c.goto(f"{BASE}/login"); chk("1b login has no birthday field", c.locator("#birthday").count() == 0 and "วันเกิด" not in c.content(), "")
    fut = (today + timedelta(days=3)).isoformat()
    c.goto(f"{BASE}/signup"); c.fill("#name", "Fut"); c.fill("#email", EF); c.fill("#password", PW)
    c.evaluate("v=>{const i=document.querySelector('#birthday');i.removeAttribute('max');i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))}", fut)
    c.click("button[type=submit]"); time.sleep(1.5)
    txt = c.locator("body").inner_text()
    chk("1d future date -> Thai error, no account", "วันเกิดต้องไม่อยู่ในอนาคต" in txt and not dbq("select 1 from users where email=?", (EF,)), {"url": c.url, "has_err": "วันเกิดต้องไม่อยู่ในอนาคต" in txt})
    Ax, a = mk("A"); hook(a, "A")
    signup(a, "AA", EA); a.wait_for_url(re.compile(r"/onboarding"))
    chk("1c signup w/o birthday -> NULL", ubd(EA)["birthday"] is None, ubd(EA))
    a.fill("#name", "Bday Test"); a.fill("#anniversary", "2023-02-14")
    a.locator("form").first.locator("button[type=submit]").click(); a.wait_for_url(re.compile(r"/calendar"))
    a.goto(f"{BASE}/settings"); code = a.locator("code.font-mono").first.inner_text().strip()
    Bx, m = mk("B"); hook(m, "B")
    signup(m, "BB", EB, "1992-03-03"); m.wait_for_url(re.compile(r"/onboarding"))
    chk("1e signup with birthday stores it", ubd(EB)["birthday"] == "1992-03-03" and ubd(EB)["show_birthday"] == 1, ubd(EB))
    m.locator("#code").fill(code); m.locator("form").nth(1).locator("button[type=submit]").click(); m.wait_for_url(re.compile(r"/calendar"))
    UA, UB = uid(EA), uid(EB); MINE.update([UA, UB])
    for u in (UA, UB):
        dbq("insert into push_subscriptions (id,user_id,endpoint,p256dh,auth) values (?,?,?,?,?)", (f"sub{u}", u, f"https://push.invalid/{u}", "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", "tBHItJI5svbpez7KI4CCXg"))
    # ---- 2 ----
    a.goto(f"{BASE}/settings"); chk("2.0 settings has label/checkbox", a.locator("text=โชว์วันเกิดในปฏิทิน").count() == 1 and a.locator("input[name=showBirthday]").is_checked(), "")
    save_bday(a, bd(D1, 1995)); body = a.locator("body").inner_text()
    chk("2a saved message + stored", "บันทึกวันเกิดแล้ว" in body and ubd(EA)["birthday"] == bd(D1, 1995), {"db": ubd(EA), "url": a.url})
    cal_m = f"{D1.year}-{D1.month:02d}"
    for who, pg in (("A", a), ("B", m)):
        pg.goto(f"{BASE}/calendar?m={cal_m}&d={D1.isoformat()}"); time.sleep(0.5)
        chk(f"2b {who} cake on day {D1}", day_cell_has_cake(pg, D1.isoformat()) == 1, day_cell_has_cake(pg, D1.isoformat()))
        rows = sel_rows(pg); want = "🎂 วันเกิด AA (ฉัน)" if who == "A" else "🎂 วันเกิด AA"
        chk(f"2c {who} selected-day row", rows == [want], rows)
        note = pg.locator("text=แก้ได้ที่ ตั้งค่า → โปรไฟล์").count()
        chk(f"2d {who} settings note {'present' if who=='A' else 'absent'}", note == (1 if who == "A" else 0), note)
        li = pg.locator("li:has(svg[aria-label=วันเกิด])")
        chk(f"2e {who} no delete button in bday row", li.locator("button, form").count() == 0, li.locator("button, form").count())
    pages = ["/calendar?m=%s&d=%s" % (cal_m, D1.isoformat()), "/dashboard"]
    leak = {}
    for who, pg in (("A", a), ("B", m)):
        for u in pages:
            pg.goto(BASE + u); time.sleep(0.4); h = pg.content()
            leak[f"{who}{u[:10]}"] = [k for k in ("1995", "อายุ", "พ.ศ. 2538", "2538") if k in h] + (["1992"] if who == "A" and "1992" in h else [])
    chk("2f no year/age text in calendar+dashboard HTML (both users)", all(not v for v in leak.values()), leak)
    a.goto(f"{BASE}/settings"); chk("2f' B's page w/o A's year", True, "") if False else None
    m.goto(f"{BASE}/settings"); chk("2f'' B settings HTML has no '1995'", "1995" not in m.content(), "")
    for who, pg in (("A", a), ("B", m)):
        pg.goto(f"{BASE}/dashboard"); t = pg.locator("body").inner_text(); n = (D1 - today).days
        chk(f"2g {who} dashboard 'อีก {n} วัน'", "วันเกิด AA" in t and f"อีก {n} วัน" in t, re.findall(r"🎂[^\n]*", t))
    # ---- 3 hide ----
    save_bday(a, bd(D1, 1995), show=False)
    chk("3.0 stored hidden", ubd(EA)["show_birthday"] == 0 and ubd(EA)["birthday"] == bd(D1, 1995), ubd(EA))
    for who, pg in (("A", a), ("B", m)):
        pg.goto(f"{BASE}/calendar?m={cal_m}&d={D1.isoformat()}"); c1 = day_cell_has_cake(pg, D1.isoformat()); r = sel_rows(pg)
        pg.goto(f"{BASE}/dashboard"); dt = "🎂 วันเกิด AA" in pg.locator("body").inner_text()
        chk(f"3a {who} hidden: no cake/row/dashboard", c1 == 0 and r == [] and not dt, {"cake": c1, "rows": r, "dash": dt})
    a.goto(f"{BASE}/settings"); chk("3b A settings still shows stored date, unchecked", a.input_value("#birthday") == bd(D1, 1995) and not a.locator("input[name=showBirthday]").is_checked(), a.input_value("#birthday"))
    save_bday(a, bd(D1, 1995), show=True)
    for who, pg in (("A", a), ("B", m)):
        pg.goto(f"{BASE}/calendar?m={cal_m}&d={D1.isoformat()}"); c1 = day_cell_has_cake(pg, D1.isoformat())
        pg.goto(f"{BASE}/dashboard"); dt = "🎂 วันเกิด AA" in pg.locator("body").inner_text()
        chk(f"3c {who} re-shown: cake & dashboard back", c1 == 1 and dt, {"cake": c1, "dash": dt})
    # yearly pin (next year, and a past year before birth)
    m.goto(f"{BASE}/calendar?m={D1.year+1}-{D1.month:02d}&d={D1.year+1}-{D1.month:02d}-{D1.day:02d}"); 
    chk("3d pinned next year too", day_cell_has_cake(m, f"{D1.year+1}-{D1.month:02d}-{D1.day:02d}") == 1, "")
    m.goto(f"{BASE}/calendar?m=1994-{D1.month:02d}&d=1994-{D1.month:02d}-{D1.day:02d}")
    chk("3e pin also shown in year before birth (1994)", day_cell_has_cake(m, f"1994-{D1.month:02d}-{D1.day:02d}") == 1, "")
    m.goto(f"{BASE}/calendar?m=1990-{D1.month:02d}&d=1990-{D1.month:02d}-{D1.day:02d}")
    chk("3e2 calendar 1990 still shows cake", day_cell_has_cake(m, f"1990-{D1.month:02d}-{D1.day:02d}") == 1 and "🎂 วันเกิด AA" in m.locator("body").inner_text(), "")
    m.goto(f"{BASE}/dashboard"); dtx = m.locator("body").inner_text()
    chk("3f dashboard heading present; ยังไม่มีนัด depends only on events", "🎂 วันเกิดที่กำลังมา (30 วัน)" in dtx and ("ยังไม่มีนัด" in dtx) == (dbq("select count(*) c from events")[0]["c"] == 0), {"heading": "🎂 วันเกิดที่กำลังมา (30 วัน)" in dtx, "empty_state": "ยังไม่มีนัด" in dtx})
    # ---- 4 clear + err params ----
    a.goto(f"{BASE}/settings"); a.fill("#birthday", ""); a.locator("button:has-text('บันทึกวันเกิด')").click(); a.wait_for_load_state("networkidle"); time.sleep(0.8)
    chk("4a clear -> NULL, nothing shown", ubd(EA)["birthday"] is None and cakes(m, D1.isoformat(), cal_m) == 0, ubd(EA))
    dialogs = []; a.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    a.goto(f"{BASE}/settings?bdayErr=" + urllib.parse.quote("<script>alert(1)</script>") if False else f"{BASE}/settings?bdayErr=%3Cscript%3Ealert(1)%3C/script%3E"); time.sleep(0.6)
    h4 = a.content(); chk("4b bdayErr=<script> shows nothing", a.locator("p.text-destructive").count() == 0 and "<script>alert(1)" not in h4 and not dialogs, {"destructive": a.locator("p.text-destructive").count(), "dialogs": dialogs, "raw_in_html": "alert(1)" in h4, "ctx": [h4[max(0,i-60):i+40] for i in [h4.find("alert(1)")] if i>=0]})
    a.goto(f"{BASE}/settings?bdayErr=future"); t = a.locator("p.text-destructive").all_inner_texts()
    chk("4c bdayErr=future Thai msg", t == ["วันเกิดต้องไม่อยู่ในอนาคต"], t)
    for code_, msg_ in (("fail", "บันทึกวันเกิดไม่สำเร็จ ลองใหม่อีกครั้ง"), ("invalid", "วันเกิดไม่ถูกต้อง")):
        a.goto(f"{BASE}/settings?bdayErr={code_}"); t = a.locator("p.text-destructive").all_inner_texts()
        chk(f"4c bdayErr={code_} -> Thai msg", t == [msg_], t)
    a.goto(f"{BASE}/settings?bdayErr=constructor"); chk("4c' bdayErr=constructor/__proto__ shows nothing", a.locator("p.text-destructive").count() == 0, "")
    # server-side future via settings
    a.goto(f"{BASE}/settings"); a.evaluate("v=>{const i=document.querySelector('#birthday');i.removeAttribute('max');i.value=v}", fut)
    a.locator("button:has-text('บันทึกวันเกิด')").click(); a.wait_for_load_state("networkidle"); time.sleep(0.8)
    t = a.locator("p.text-destructive").all_inner_texts()
    chk("4d settings future date -> Thai err, not stored", t == ["วันเกิดต้องไม่อยู่ในอนาคต"] and ubd(EA)["birthday"] is None, {"t": t, "url": a.url, "db": ubd(EA)})
    # ---- 5 Feb 29 ----
    save_bday(m, "2000-02-29")
    for ym, day, other in (("2027-02", "2027-02-28", "2027-02-29"), ("2028-02", "2028-02-29", "2028-02-28"), ("2026-02", "2026-02-28", None)):
        c1 = [day_cell_has_cake(a, d) if (a.goto(f"{BASE}/calendar?m={ym}&d={day}") or True) else 0 for d in ([day] + ([other] if other and other[-2:] != "29" or ym == "2028-02" and other else []))]
        a.goto(f"{BASE}/calendar?m={ym}&d={day}"); time.sleep(0.4)
        on_day = day_cell_has_cake(a, day); on_other = day_cell_has_cake(a, other) if other else 0
        chk(f"5 Feb29 bday in {ym}: cake on {day[-2:]}", on_day == 1 and on_other == 0 and a.locator("svg[aria-label^='วันเกิด']").count() >= 1, {"on": on_day, "other": on_other, "total_cakes": a.locator("svg[aria-label^='วันเกิด']").count()})
    # restore B to 1992 shown
    save_bday(m, "1992-03-03")
    # ---- 6 cron ----
    save_bday(a, bd(D1, 1995), show=True)
    tag = lambda u, d: f"{u}:{d.isoformat()}"
    got = lambda u, d: sorted(r["user_id"] for r in logs() if r["ref"] == tag(u, d))
    both = sorted([UA, UB]); pre = D1 - timedelta(days=1)
    # target year occurrence date: D1 is this year's (future) date
    cron(L(pre, "08:59")); chk("6a 08:59 -> none", got(UA, D1) == [], got(UA, D1))
    cron(L(pre, "09:00")); chk("6b 09:00 -> logged for BOTH, ref A:D", got(UA, D1) == both, got(UA, D1))
    ob = [o for o in dbq("select user_id,kind,title,body,url from notification_outbox where kind='birthday'") if o['user_id'] in MINE and o['url'].endswith(D1.isoformat())]
    chk("6b' outbox rows per user (A self-text, B partner-text)", len(ob) == 2 and {o["user_id"]: o["title"] for o in ob}.get(UA, "").startswith("🎂 พรุ่งนี้วันเกิดเธอ") and "AA" in {o["user_id"]: o["title"] for o in ob}.get(UB, ""), ob)
    cron(L(pre, "09:05")); chk("6c 09:05 no duplicate", got(UA, D1) == both and len([1 for o in dbq("select user_id,url from notification_outbox where kind='birthday'") if o['user_id'] in MINE and o['url'].endswith(D1.isoformat())]) == 2, got(UA, D1))
    cron(L(D1, "09:00")); chk("6c' day-of (D) 09:00: no new reminder for A", got(UA, D1) == both and len(logs()) == 2, logs())
    # 6d: B disables birthday pref; A bday moves to D2
    save_bday(a, bd(D2, 1995), show=True)
    m.goto(f"{BASE}/settings"); cb = m.locator("input[type=checkbox][name=birthday]"); was = cb.is_checked(); cb.uncheck()
    m.locator("button:has-text('บันทึกการตั้งค่า')").click(); m.wait_for_load_state("networkidle"); time.sleep(0.8)
    m.goto(f"{BASE}/settings"); persisted_off = not m.locator("input[type=checkbox][name=birthday]").is_checked()
    lab = m.locator("label:has(input[name=birthday][type=checkbox])").inner_text()
    pre2 = D2 - timedelta(days=1); cron(L(pre2, "09:00"))
    chk("6d B disabled pref -> only A gets D2 reminder", was and persisted_off and got(UA, D2) == [UA], {"label": lab.strip(), "was_on_default": was, "got": got(UA, D2)})
    # 6e: hidden user -> nothing. B bday D3 hidden
    save_bday(m, bd(D3, 1992), show=False)
    m.goto(f"{BASE}/settings"); m.locator("input[type=checkbox][name=birthday]").check(); m.locator("button:has-text('บันทึกการตั้งค่า')").click(); m.wait_for_load_state("networkidle"); time.sleep(0.6)
    pre3 = D3 - timedelta(days=1); cron(L(pre3, "09:00"))
    chk("6e hidden B bday -> nothing logged", got(UB, D3) == [], {"logged": got(UB, D3), "all": logs()})
    # 6f: cleared -> nothing
    save_bday(m, "", show=True); n0 = len(logs()); cron(L(pre3, "09:10")); chk("6f cleared -> no new logs", len(logs()) == n0, ubd(EB))
    # 6g Feb 29 reminder: B 2000-02-29 -> 2027-02-27 09:00 reminder for ref 2027-02-28
    save_bday(m, "2000-02-29", show=True)
    cron(L(datetime(2027, 2, 27).date(), "09:00"))
    chk("6g Feb29 non-leap: reminder on 02-27 with ref B:2027-02-28", got(UB, datetime(2027, 2, 28).date()) == both, got(UB, datetime(2027, 2, 28).date()))
    # console
    chk("7 console/page errors", not errors, errors[:5]); chk("7 5xx responses", not bad, bad[:5])
    b.close()
print("\n==== SUMMARY ====")
for n, ok, ev in res: print("PASS" if ok else "FAIL", n)
print("failed:", sum(1 for r in res if not r[1]), "of", len(res))
