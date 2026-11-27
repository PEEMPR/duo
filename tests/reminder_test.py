"""QA: per-event advance reminder (เตือนล่วงหน้า). Run against vite preview on :4174 of a QA copy that has VAPID keys.
Usage: python3 reminder_test.py [duo_dir]   (duo_dir holds .cloudflare/state; default /home/claude/duo-qa)
"""
import re, sys, time, glob, sqlite3, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4174"
ROOT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/duo-qa"
BKK = timezone(timedelta(hours=7))
stamp = str(int(time.time()))
PW = "password123"
EA = f"ra{stamp}@test.dev"; EB = f"rb{stamp}@test.dev"
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

def signup(page, name, email):
    page.goto(f"{BASE}/signup")
    page.fill("#name", name); page.fill("#email", email); page.fill("#password", PW)
    page.click("button[type=submit]"); page.wait_for_url(re.compile(r"/onboarding"))

def cron(dt):
    ms = int(dt.timestamp() * 1000)
    urllib.request.urlopen(f"{BASE}/cdn-cgi/local/scheduled?cron=*+*+*+*+*&time={ms}", timeout=30).read()
    time.sleep(2.5)

def logs(kind):
    return dbq("select user_id, ref from notification_log where kind=?", (kind,))

def opts(page):
    return page.eval_on_selector("#remindBeforeSelect", "s=>({opts:[...s.options].map(o=>o.value), sel:s.value, hidden:document.querySelector('input[name=remindBefore]').value})")

def setdt(page, date, time_=""):
    page.fill("#date", date); page.fill("#time", time_); time.sleep(0.4)

def add_event(page, title, date, time_="", remind=None, custom=None):
    page.goto(f"{BASE}/calendar?d={date}"); page.wait_for_selector("#remindBeforeSelect"); time.sleep(0.5)
    page.fill("#title", f"{title} {stamp}"); setdt(page, date, time_)
    if remind: page.select_option("#remindBeforeSelect", remind)
    if custom:
        page.select_option("#remindBeforeSelect", "custom"); page.fill("input[aria-label='จำนวนวันที่เตือนล่วงหน้า']", str(custom)); time.sleep(0.3)
    page.click("button:has-text('บันทึกนัด')"); page.wait_for_load_state("networkidle"); time.sleep(0.8)

def ev_row(title):
    r = dbq("select id, remind_before, start_at, all_day from events where title like ? order by created_at desc", (f"{title}%{stamp}%" if not title.startswith("BAD") else f"{title}%",)); return r[0] if r else None

now = datetime.now(BKK)
today = now.date()
fmt = lambda d: d.isoformat()
D = today + timedelta(days=14)           # fixed future date for cron tests
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    A = b.new_context(locale="th-TH", timezone_id="Asia/Bangkok"); a = A.new_page(); hook(a, "A")
    signup(a, "AA", EA)
    a.fill("#name", "Remind Test"); a.fill("#anniversary", "2023-02-14")
    a.locator("form").first.locator("button[type=submit]").click(); a.wait_for_url(re.compile(r"/calendar"))
    a.goto(f"{BASE}/settings"); code = a.locator("code.font-mono").first.inner_text().strip()
    B = b.new_context(locale="th-TH", timezone_id="Asia/Bangkok"); m = B.new_page(); hook(m, "B")
    signup(m, "BB", EB); m.locator("#code").fill(code)
    m.locator("form").nth(1).locator("button[type=submit]").click(); m.wait_for_url(re.compile(r"/calendar"))
    uids = {r["email"]: r["id"] for r in dbq("select id,email from users")}
    UA, UB = uids[EA], uids[EB]
    chk("0 setup couple", bool(UA and UB), f"A={EA} B={EB} now(BKK)={now:%Y-%m-%d %H:%M}")

    # ---------- 1. form behaviour ----------
    a.goto(f"{BASE}/calendar"); a.wait_for_selector("#remindBeforeSelect"); time.sleep(0.5)
    chk("1a label 'เตือนล่วงหน้า' visible", a.locator("label[for=remindBeforeSelect]").inner_text().strip() == "เตือนล่วงหน้า", a.locator("label[for=remindBeforeSelect]").inner_text())
    d5 = fmt(today + timedelta(days=5))
    setdt(a, d5, "12:00"); o = opts(a)
    want = {"d3", "d2", "d1", "h12", "h6", "h3", "h2", "none", "custom"}
    chk("1b +5d w/ time: options & default d1", set(o["opts"]) == want and "d7" not in o["opts"] and o["sel"] == "d1" and o["hidden"] == "", o)
    hint = lambda: a.locator("text=ก่อน 1 ชั่วโมงให้อัตโนมัติ").count()
    chk("1b' hour hint shown with time", hint() == 1, hint())
    tom = fmt(today + timedelta(days=1))
    def quiet(dt): hm = dt.astimezone(BKK).strftime("%H:%M"); return hm >= "23:00" or hm < "07:00"
    def exp_default(date_, hm_):
        nw = datetime.now(BKK); st = datetime.fromisoformat(f"{date_}T{hm_}:00+07:00")
        d1 = datetime.fromisoformat(f"{date_}T09:00:00+07:00") - timedelta(days=1)
        if d1 > nw: return "d1"
        for h in (12, 6, 3, 2):   # ascending fire time == descending hours
            f = st - timedelta(hours=h)
            if f > nw and not quiet(f): return f"h{h}"
        return "none"
    for hm_ in ("10:00", "13:00", "11:00"):
        setdt(a, tom, hm_); o = opts(a); ex = exp_default(tom, hm_)
        chk(f"1c tomorrow {hm_}: default={ex} (quiet-hours skipped), hidden ''", o["sel"] == ex and o["hidden"] == "" and "d1" not in o["opts"], {"expect": ex, **o})
    setdt(a, tom, "13:00"); a.select_option("#remindBeforeSelect", "h12"); time.sleep(0.3); o = opts(a)
    chk("1c' explicit quiet choice (h12 -> 01:00) still allowed, hidden h12", o["sel"] == "h12" and o["hidden"] == "h12", o)
    a.goto(f"{BASE}/calendar"); a.wait_for_selector("#remindBeforeSelect"); time.sleep(0.5)  # fresh form (a touched choice is intentionally kept)
    setdt(a, d5, "12:00"); o_back = opts(a)
    chk("1c'' going back to +5d restores d1 default", o_back["sel"] == "d1", o_back)
    setdt(a, d5, ""); o = opts(a)
    chk("1d clear time: no hour options, no hint", not any(v.startswith("h") for v in o["opts"]) and hint() == 0 and o["sel"] == "d1" and o["hidden"] == "", {**o, "hint": hint()})
    setdt(a, d5, "12:00"); a.select_option("#remindBeforeSelect", "custom"); ci = a.locator("input[aria-label='จำนวนวันที่เตือนล่วงหน้า']")
    ci.click(); a.keyboard.type("3"); time.sleep(0.4)
    chk("1e custom: type 3 -> input keeps '3', hidden d3", ci.input_value() == "3" and opts(a)["hidden"] == "d3", {"input": ci.input_value(), **opts(a)})
    ci.fill(""); a.keyboard.type("24"); time.sleep(0.4)
    chk("1f custom 24 on +5d -> past hint, hidden ''", ci.input_value() == "24" and a.locator("text=เวลาเตือนนี้ผ่านไปแล้ว จะใช้ค่าเริ่มต้นแทน").count() == 1 and opts(a)["hidden"] == "", {"input": ci.input_value(), **opts(a)})

    # ---------- 2. stored values ----------
    cases = [("Q d3 custom", d5, "12:00", None, 3, "d3"), ("Q h6", d5, "12:00", "h6", None, "h6"), ("Q none", d5, "12:00", "none", None, "none"),
             ("Q default", d5, "12:00", None, None, "d1"), ("Q allday d2", d5, "", "d2", None, "d2"), ("Q d3 preset", d5, "12:00", "d3", None, "d3")]
    for title, dt_, tm, rem, cu, exp in cases:
        add_event(a, title, dt_, tm, rem, cu); r = ev_row(title)
        chk(f"2 stored '{title}' -> {exp}", bool(r) and r["remind_before"] == exp, r)
    # tomorrow w/ default (d1 may be past) -> stored must equal what UI offered
    a.goto(f"{BASE}/calendar?d={tom}"); a.wait_for_selector("#remindBeforeSelect"); a.fill("#title", f"Q tomorrow default {stamp}"); setdt(a, tom, "10:00"); o = opts(a)
    a.click("button:has-text('บันทึกนัด')"); a.wait_for_load_state("networkidle"); time.sleep(0.8); r = ev_row("Q tomorrow default")
    chk("2 tomorrow default stored == UI default (hidden '')", bool(r) and r["remind_before"] == o["sel"] == exp_default(tom, "10:00") and o["hidden"] == "", {"ui": o, "db": r})
    add_event(a, "Q quiet h12", tom, "13:00", "h12"); r = ev_row("Q quiet h12")
    chk("2 explicit quiet choice stored h12", bool(r) and r["remind_before"] == "h12", r)
    add_event(a, "Q tomorrow 13 default", tom, "13:00"); r = ev_row("Q tomorrow 13 default")
    chk("2 tomorrow 13:00 default stored == h6 (not h12)", bool(r) and r["remind_before"] == exp_default(tom, "13:00"), {"db": r, "exp": exp_default(tom, "13:00")})
    # 4. reset after submit: no carry-over of none / custom
    for tag, kw in (("none", dict(remind="none")), ("custom", dict(custom=3))):
        add_event(a, f"Q carry {tag}", d5, "12:00", **kw)
        a.wait_for_selector("#remindBeforeSelect"); time.sleep(0.8); a.fill("#date", d5); a.fill("#time", "12:00"); time.sleep(0.5); o = opts(a)
        chk(f"2.4 after submit w/ {tag}: select back to default d1, hidden ''", o["sel"] == "d1" and o["hidden"] == "" and a.locator("input[aria-label='จำนวนวันที่เตือนล่วงหน้า']").count() == 0, o)
    # soft reset (same page, no navigation)
    a.goto(f"{BASE}/calendar?d={d5}"); a.wait_for_selector("#remindBeforeSelect"); a.select_option("#remindBeforeSelect", "none"); a.evaluate("document.querySelector('#remindBeforeSelect').closest('form').reset()"); time.sleep(0.8); a.fill("#date", d5); a.fill("#time", "12:00"); time.sleep(0.4); o = opts(a)
    chk("2.4b form.reset() clears chosen 'none'", o["sel"] == "d1" and o["hidden"] == "", o)

    # ---------- 3. server validation ----------
    before = dbq("select count(*) c from events")[0]["c"]
    a.goto(f"{BASE}/calendar?d={tom}"); a.wait_for_selector("#remindBeforeSelect"); a.fill("#title", "BAD past d7"); setdt(a, tom, "10:00"); time.sleep(0.3)
    a.evaluate("document.querySelector('input[name=remindBefore]').value='d7'")
    a.click("button:has-text('บันทึกนัด')"); a.wait_for_load_state("networkidle"); time.sleep(1)
    body = a.locator("form p.text-destructive").all_inner_texts()
    after = dbq("select count(*) c from events")[0]["c"]
    chk("3a hidden d7 for tomorrow -> Thai past error, no event", any("เวลาเตือนนี้ผ่านไปแล้ว" in t for t in body) and before == after and ev_row("BAD past d7") is None, {"texts": body, "url": a.url, "count": (before, after)})
    for label, val in [("bad hidden value 'zzz'", "zzz"), ("h6 on all-day", "h6"), ("d99", "d99")]:
        a.goto(f"{BASE}/calendar?d={d5}"); a.wait_for_selector("#remindBeforeSelect"); a.fill("#title", "BAD " + val); setdt(a, d5, "" if val == "h6" else "12:00"); time.sleep(0.3)
        a.evaluate("v=>document.querySelector('input[name=remindBefore]').value=v", val)
        a.click("button:has-text('บันทึกนัด')"); a.wait_for_load_state("networkidle"); time.sleep(1)
        t = a.locator("form p.text-destructive").all_inner_texts()
        chk(f"3b {label}: error shown & no event", ev_row("BAD " + val) is None and len(t) >= 1, {"texts": t})
    dialogs = []; a.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    a.goto(f"{BASE}/calendar?err=" + urllib.parse.quote("<script>alert(1)</script>")); time.sleep(0.8)
    t = a.locator("form p.text-destructive").all_inner_texts(); html = a.content()
    chk("3c ?err=<script> -> generic only", t == ["บันทึกนัดไม่สำเร็จ ลองใหม่อีกครั้ง"] and "alert(1)" not in a.locator("form").first.inner_html() and not dialogs, {"t": t, "dialogs": dialogs})
    a.goto(f"{BASE}/calendar?err=hello"); t = a.locator("form p.text-destructive").all_inner_texts()
    chk("3d ?err=hello -> generic only", t == ["บันทึกนัดไม่สำเร็จ ลองใหม่อีกครั้ง"] and "hello" not in a.locator("form").first.inner_text(), t)
    a.goto(f"{BASE}/calendar?err=" + urllib.parse.quote("เวลาเตือนนี้ผ่านไปแล้ว เลือกเวลาที่ใกล้กว่านี้")); t = a.locator("form p.text-destructive").all_inner_texts()
    chk("3e known Thai error text passes through", len(t) == 1 and t[0].startswith("เวลาเตือนนี้ผ่านไปแล้ว"), t)

    # ---------- 4. cron ----------
    def L(d, hm): h, mi = map(int, hm.split(":")); return datetime(d.year, d.month, d.day, h, mi, tzinfo=BKK)
    # subscriptions for both users
    for u in (UA, UB):
        dbq("insert into push_subscriptions (id,user_id,endpoint,p256dh,auth) values (?,?,?,?,?)", (f"sub{u}", u, f"https://push.invalid/{u}", "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", "tBHItJI5svbpez7KI4CCXg"))
    add_event(a, "C1 d1", fmt(D), "14:00", "d1")
    add_event(a, "C2 d1 next", fmt(D + timedelta(days=1)), "14:00", "d1")
    add_event(a, "C5 h3 12:30", fmt(D + timedelta(days=2)), "12:30", "h3")
    add_event(a, "C6 h3 12:29", fmt(D + timedelta(days=2)), "12:29", "h3")
    add_event(a, "C8 h2 01:00", fmt(D + timedelta(days=3)), "01:00", "h2")
    add_event(a, "C7 tomorrow-summary", fmt(D + timedelta(days=5)), "", "d1")
    R = {t: ev_row(t) for t in ["C1 d1", "C2 d1 next", "C5 h3 12:30", "C6 h3 12:29", "C8 h2 01:00", "C7 tomorrow-summary"]}
    chk("4.0 cron events stored", all(R.values()) and R["C8 h2 01:00"]["remind_before"] == "h2", {k: (v or {}).get("remind_before") for k, v in R.items()})
    adv = lambda t: sorted(r["user_id"] for r in logs("event_adv") if r["ref"] == R[t]["id"] and r["user_id"] in (UA, UB))
    one = lambda t: sorted(r["user_id"] for r in logs("event_1h") if r["ref"] == R[t]["id"] and r["user_id"] in (UA, UB))
    both = sorted([UA, UB])
    cron(L(D - timedelta(days=1), "08:59")); chk("4a 08:59 day-before: no event_adv for C1", adv("C1 d1") == [], adv("C1 d1"))
    cron(L(D - timedelta(days=1), "09:00")); chk("4b 09:00: event_adv for BOTH users", adv("C1 d1") == both, adv("C1 d1"))
    ob = dbq("select user_id,kind,title,sent_at from notification_outbox where title like '%C1 d1 "+stamp+"%'")
    chk("4b' outbox row per user, title 'พรุ่งนี้: ...'", len(ob) == 2 and all("พรุ่งนี้" in r["title"] for r in ob), ob)
    cron(L(D - timedelta(days=1), "09:05")); chk("4c 09:05 no duplicate", adv("C1 d1") == both and len(dbq("select 1 from notification_outbox where title like '%C1 d1 "+stamp+"%'")) == 2, adv("C1 d1"))
    cron(L(D, "09:40")); chk("4d 09:40 (fire 09:00, 40 min late) not sent for C2", adv("C2 d1 next") == [], adv("C2 d1 next"))
    cron(L(D + timedelta(days=2), "10:00")); chk("4e catch-up boundary: fire 09:30 @10:00 sent (C5), fire 09:29 not (C6)", adv("C5 h3 12:30") == both and adv("C6 h3 12:29") == [], {"C5": adv("C5 h3 12:30"), "C6": adv("C6 h3 12:29")})
    cron(L(D + timedelta(days=2), "22:59")); chk("4f h2 @22:59 not yet", adv("C8 h2 01:00") == [], adv("C8 h2 01:00"))
    cron(L(D + timedelta(days=2), "23:00")); chk("4g h2 (01:00 start) advance fires 23:00 in quiet hours, both users", adv("C8 h2 01:00") == both and one("C8 h2 01:00") == [], {"adv": adv("C8 h2 01:00"), "1h": one("C8 h2 01:00")})
    cron(L(D + timedelta(days=3), "00:00")); chk("4h 1-hour reminder at 00:00, both users", one("C8 h2 01:00") == both, one("C8 h2 01:00"))
    cron(L(D + timedelta(days=3), "00:01")); chk("4h' no dup 1h/adv", one("C8 h2 01:00") == both and adv("C8 h2 01:00") == both, (one("C8 h2 01:00"), adv("C8 h2 01:00")))
    tomref = fmt(D + timedelta(days=5))
    et = lambda: sorted(r["user_id"] for r in logs("event_tomorrow") if r["ref"] == tomref and r["user_id"] in (UA, UB))
    cron(L(D + timedelta(days=4), "20:00")); chk("4i 20:00 summary NOT sent by default", et() == [], et())
    a.goto(f"{BASE}/settings"); cb = a.locator("input[name=event_tomorrow]")
    unchecked = not cb.is_checked(); cb.check()
    a.locator("button:has-text('บันทึกการตั้งค่า')").click(); a.wait_for_load_state("networkidle"); time.sleep(0.8)
    a.goto(f"{BASE}/settings"); persisted = a.locator("input[name=event_tomorrow]").is_checked()
    mp = dbq("select id, notify_prefs from users where id in (?,?)", (UA, UB))
    cron(L(D + timedelta(days=4), "20:05")); chk("4j after enabling for A only: summary only for A", unchecked and persisted and et() == [UA], {"default_unchecked": unchecked, "persisted": persisted, "logged": et(), "A": UA})
    cron(L(D + timedelta(days=4), "20:10")); chk("4j' no duplicate summary", et() == [UA], et())
    A.close() if False else None
    chk("6 console/page errors", not errors, errors[:5]); chk("6 5xx responses", not bad, bad[:5])
    b.close()
print("\n==== SUMMARY ====")
for n, ok, ev in res: print("PASS" if ok else "FAIL", n)
print("failed:", sum(1 for r in res if not r[1]), "of", len(res))
