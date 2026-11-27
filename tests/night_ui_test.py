import re, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173"
stamp = str(int(time.time()))
PW = "password123"
EA = f"a{stamp}@test.dev"; EB = f"b{stamp}@test.dev"
res = []; errors = []; bad = []
def chk(name, ok, ev): res.append((name, ok, ev)); print("PASS" if ok else "FAIL", name, "|", ev, flush=True)

def hook(page, tag):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{tag} console {m.text[:200]}"))
    page.on("response", lambda r: r.status >= 500 and bad.append(f"{tag} {r.status} {r.url}"))

def signup(page, name, email):
    page.goto(f"{BASE}/signup")
    page.fill("#name", name); page.fill("#email", email); page.fill("#password", PW)
    page.click("button[type=submit]"); page.wait_for_url(re.compile(r"/onboarding"))

def metas(page): return page.eval_on_selector_all('meta[name="theme-color"]', "els=>els.map(e=>e.content)")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    A = b.new_context(locale="th-TH"); a = A.new_page(); hook(a, "A")
    signup(a, "AA", EA)
    a.fill("#name", "Night Test"); a.fill("#anniversary", "2023-02-14")
    a.locator("form").first.locator("button[type=submit]").click(); a.wait_for_url(re.compile(r"/calendar"))
    a.goto(f"{BASE}/settings"); code = a.locator("code.font-mono").first.inner_text().strip()
    B = b.new_context(locale="th-TH"); m = B.new_page(); hook(m, "B")
    signup(m, "BB", EB); m.locator("#code").fill(code)
    m.locator("form").nth(1).locator("button[type=submit]").click(); m.wait_for_url(re.compile(r"/calendar"))
    chk("1 signup+couple+join", True, f"code={code}, A={EA}, B={EB}")

    # 2 theme
    a.goto(f"{BASE}/dashboard"); mm = metas(a)
    chk("2 rose default", mm == ["#fdf7f7"], mm)
    def set_theme(name):
        a.goto(f"{BASE}/settings"); a.locator(f"button[name=theme]:has-text('{name}')").click(); a.wait_for_load_state("networkidle")
    set_theme("กลางคืน"); a.goto(f"{BASE}/dashboard"); mm = metas(a)
    chk("2 midnight", mm == ["#16141f"], mm)
    set_theme("ครีมโกโก้"); a.goto(f"{BASE}/dashboard"); mm = metas(a)
    chk("2 cocoa", mm == ["#faf6ef"], mm)
    set_theme("ชมพูกุหลาบ")
    anon = b.new_context().new_page(); hook(anon, "anon"); anon.goto(f"{BASE}/login"); mm = metas(anon)
    chk("2 /login default", mm == ["#e0607e"], mm)

    # 3 change email
    def attempt(email, pw):
        a.goto(f"{BASE}/settings")
        a.fill("#newEmail", email, ) if False else None
        a.evaluate("document.getElementById('newEmail').removeAttribute('type')") if not re.match(r"^\S+@\S+\.\S+$", email.strip()) or " " in email else None
        a.fill("#newEmail", email); a.fill("#currentPassword", pw)
        a.locator("form:has(#newEmail) button[type=submit]").click()
        a.wait_for_load_state("networkidle"); time.sleep(0.5)
        return a.url, a.locator("form:has(#newEmail) p").all_inner_texts(), a.locator("text=อีเมลสำหรับล็อกอิน").inner_text()
    u, t, cur = attempt("new1@test.dev", "wrongpass1")
    chk("3a wrong pw", any("รหัสผ่านไม่ถูกต้อง" in x for x in t) and EA in cur, (u, t, cur))
    # 3b: try with native validation first
    a.goto(f"{BASE}/settings"); a.fill("#newEmail", "abc"); a.fill("#currentPassword", PW)
    a.locator("form:has(#newEmail) button[type=submit]").click(); time.sleep(0.7)
    native_blocked = "/settings" in a.url and "rr=" not in a.url
    a.evaluate("document.getElementById('newEmail').removeAttribute('type')")
    a.locator("form:has(#newEmail) button[type=submit]").click(); a.wait_for_load_state("networkidle"); time.sleep(0.5)
    t = a.locator("form:has(#newEmail) p").all_inner_texts()
    chk("3b invalid format", any("รูปแบบอีเมลไม่ถูกต้อง" in x for x in t), f"native_blocked={native_blocked}, bypass via removing type; texts={t}")
    u, t, cur = attempt(EB, PW); chk("3c B's email", any("อีเมลนี้มีคนใช้แล้ว" in x for x in t), t)
    u, t, cur = attempt(EA, PW); chk("3d same email", any("นี่คืออีเมลที่ใช้อยู่แล้ว" in x for x in t), t)
    NEW = f"New.User{stamp}@Test.DEV"
    a.goto(f"{BASE}/settings"); a.fill("#newEmail", f"  {NEW}  "); a.fill("#currentPassword", PW)
    a.locator("form:has(#newEmail) button[type=submit]").click(); a.wait_for_load_state("networkidle"); time.sleep(0.5)
    ok_txt = a.locator("text=เปลี่ยนอีเมลแล้ว").count(); cur = a.locator("text=อีเมลสำหรับล็อกอิน").inner_text()
    a.goto(f"{BASE}/dashboard"); still = "/dashboard" in a.url
    chk("3e uppercase+spaces", ok_txt >= 1 and still and NEW.lower() in cur, f"success_text={ok_txt}, shown='{cur}', url={a.url}")
    a.goto(f"{BASE}/settings"); a.click("text=ออกจากระบบ"); a.wait_for_load_state("networkidle")
    def login(email):
        a.goto(f"{BASE}/login"); a.fill("#email", email); a.fill("#password", PW); a.click("button[type=submit]"); a.wait_for_load_state("networkidle"); time.sleep(0.8)
        return a.url, a.locator("body").inner_text()[:200].replace("\n", " ")
    u, bt = login(EA); chk("3f old email fails", "/calendar" not in u, (u, bt))
    u, bt = login(NEW.lower()); chk("3f new email ok", "/calendar" in u, u)

    # 4
    for q in ["<script>alert(1)</script>", "hello"]:
        dialogs = []; a.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
        a.goto(f"{BASE}/settings?err={q}"); a.wait_for_load_state("networkidle"); time.sleep(0.5)
        p_ = a.locator("form:has(#newEmail) p.text-destructive")
        txt = p_.all_inner_texts(); html = p_.first.inner_html() if p_.count() else None
        scripts = a.evaluate("[...document.querySelectorAll('form script')].length")
        chk(f"4 err={q}", not dialogs and scripts == 0, f"text={txt}, innerHTML={html}, dialogs={dialogs}, script_elems_in_form={scripts}")
    print("ERRORS", errors); print("5xx", bad)
    chk("5 console/500", not bad, f"console_errors={errors}, 5xx={bad}")
    b.close()
