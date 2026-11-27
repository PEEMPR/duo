import re, sys, time
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:4173"
OUT = "/tmp/duo-shots"
import os; os.makedirs(OUT, exist_ok=True)
stamp = str(int(time.time()))

def signup(page, name, email):
    page.goto(f"{BASE}/signup")
    page.fill("#name", name); page.fill("#email", email); page.fill("#password", "password123")
    page.click("button[type=submit]")
    page.wait_for_url(re.compile(r"/onboarding"))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    A = b.new_context(viewport={"width": 1280, "height": 860}, locale="th-TH")
    a = A.new_page()
    errors = []
    a.on("pageerror", lambda e: errors.append(str(e)))
    signup(a, "ME", f"me{stamp}@test.dev")
    # create couple
    a.fill("#name", "ME & You"); a.fill("#anniversary", "2023-02-14")
    a.locator("form").first.locator("button[type=submit]").click()
    a.wait_for_url(re.compile(r"/dashboard"))
    a.goto(f"{BASE}/settings")
    code = a.locator("code.font-mono").first.inner_text().strip()
    print("invite code:", code)

    B = b.new_context(viewport={"width": 390, "height": 844}, locale="th-TH", is_mobile=True, has_touch=True)
    m = B.new_page()
    m.on("pageerror", lambda e: errors.append(str(e)))
    signup(m, "You", f"you{stamp}@test.dev")
    m.locator("#code").fill(code)
    m.locator("form").nth(1).locator("button[type=submit]").click()
    m.wait_for_url(re.compile(r"/dashboard"))
    print("partner joined")

    # A: add event
    a.goto(f"{BASE}/calendar")
    a.fill("#title", "ดินเนอร์ครบรอบ"); a.fill("#time", "19:00"); a.fill("#endTime", "21:00"); a.fill("#location", "ริมน้ำ")
    a.click("text=บันทึกนัด"); a.wait_for_load_state("networkidle")
    expect(a.locator("text=ดินเนอร์ครบรอบ").first).to_be_visible()
    print("event ok")

    # A: list item
    a.goto(f"{BASE}/lists"); a.click("text=ของที่ต้องซื้อ"); a.wait_for_url(re.compile(r"/lists/"))
    a.fill("input[name=text]", "นม"); a.click("button:has-text('เพิ่ม')"); a.wait_for_load_state("networkidle")
    a.fill("input[name=text]", "ไข่ไก่"); a.click("button:has-text('เพิ่ม')"); a.wait_for_load_state("networkidle")
    expect(a.locator("text=ไข่ไก่")).to_be_visible()
    a.locator("button[aria-label='ทำเสร็จแล้ว']").first.click(); a.wait_for_load_state("networkidle")
    print("list ok")

    # B: check-in first → A should see it hidden until A checks in
    m.goto(f"{BASE}/checkin")
    m.locator("label:has(input[name=mood][value='5'])").click()
    m.locator("label:has(input[name=energy][value='4'])").click()
    m.fill("#need", "อยากกินชาบู")
    m.click("button:has-text('เช็กอิน')"); m.wait_for_load_state("networkidle")
    a.goto(f"{BASE}/checkin")
    hidden = a.locator("text=ตอบแล้ว — เช็กอินเพื่อดู").count()
    print("partner hidden before A checks in:", hidden)
    assert hidden == 1 and a.locator("text=อยากกินชาบู").count() == 0
    a.locator("label:has(input[name=mood][value='4'])").click()
    a.locator("label:has(input[name=energy][value='3'])").click()
    a.fill("#gratitude", "ขอบคุณที่ทำกับข้าวให้")
    a.click("button:has-text('เช็กอิน')"); a.wait_for_load_state("networkidle")
    a.goto(f"{BASE}/checkin")
    assert a.locator("text=อยากกินชาบู").count() >= 1
    print("checkin reveal ok")

    # A: plan
    a.goto(f"{BASE}/plans")
    a.fill("#title", "ทริปเชียงใหม่ปีใหม่"); a.fill("#targetDate", "2026-12-30"); a.fill("#milestones", "จองตั๋วเครื่องบิน\nจองที่พัก\nทำลิสต์คาเฟ่")
    a.click("button:has-text('สร้างแผน')"); a.wait_for_load_state("networkidle")
    a.locator("button[aria-label='สลับสถานะ']").first.click(); a.wait_for_load_state("networkidle")
    print("plan ok")

    # B (mobile): private note + shared note
    m.goto(f"{BASE}/notes/new")
    m.fill("input[name=title]", "ไอเดียเซอร์ไพรส์วันเกิด"); m.fill("textarea[name=body]", "ซื้อเค้กช็อกโกแลต")
    m.select_option("#visibility", "private"); m.click("button:has-text('บันทึก')"); m.wait_for_url(re.compile(r"saved=1"))
    m.goto(f"{BASE}/notes/new")
    m.fill("input[name=title]", "เดตแรกของเรา"); m.fill("textarea[name=body]", "ร้านกาแฟเล็ก ๆ ที่อารีย์")
    m.click("button:has-text('บันทึก')"); m.wait_for_url(re.compile(r"saved=1"))
    a.goto(f"{BASE}/notes")
    assert a.locator("text=เดตแรกของเรา").count() == 1 and a.locator("text=ไอเดียเซอร์ไพรส์วันเกิด").count() == 0
    print("note privacy ok")

    a.goto(f"{BASE}/dashboard"); a.wait_for_load_state("networkidle"); a.screenshot(path=f"{OUT}/dashboard-desktop.png", full_page=True)
    m.goto(f"{BASE}/dashboard"); m.wait_for_load_state("networkidle"); m.screenshot(path=f"{OUT}/dashboard-mobile.png", full_page=True)
    a.goto(f"{BASE}/calendar"); a.screenshot(path=f"{OUT}/calendar.png", full_page=True)
    m.goto(f"{BASE}/checkin"); m.screenshot(path=f"{OUT}/checkin-mobile.png", full_page=True)
    a.goto(f"{BASE}/plans"); a.screenshot(path=f"{OUT}/plans.png", full_page=True)
    A.storage_state(path="/tmp/duo-stateA.json")
    open("/tmp/duo-userA.txt", "w").write(f"me{stamp}@test.dev")
    print("page errors:", errors)
    b.close()
