import { headers } from "next/headers";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { Bell, Bot, Check, Heart, LogOut, Palette, PawPrint, RefreshCw, Smartphone, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { changeEmailAction, updateBirthdayAction, logoutAction, regenerateInviteAction, setCharacterAction, updateCoupleAction, updateNameAction, updateNotifyPrefsAction, updateThemeAction } from "@/app/actions";
import { PushSetup } from "@/components/push-setup";
import { NativeSelect } from "@/components/ui/native-select";
import type { EmailChangeError } from "@/lib/auth";
import { CHARACTERS } from "@/lib/characters";
import { users } from "@/lib/db/schema";
import { NOTIFY_KINDS, parsePrefs, REMINDER_TIMES } from "@/lib/notify";
import { getCouple, getMyBirthday } from "@/lib/core";
import { todayIn } from "@/lib/time";
import { appTz, db, requireActor } from "@/lib/server";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";

const EMAIL_ERR_TEXT: Record<EmailChangeError, string> = {
  format: "รูปแบบอีเมลไม่ถูกต้อง",
  pw: "รหัสผ่านไม่ถูกต้อง",
  same: "นี่คืออีเมลที่ใช้อยู่แล้ว",
  taken: "อีเมลนี้มีคนใช้แล้ว",
  fail: "เปลี่ยนอีเมลไม่สำเร็จ ลองใหม่อีกครั้ง",
};

const BDAY_ERR_TEXT: Record<string, string> = {
  invalid: "วันเกิดไม่ถูกต้อง",
  future: "วันเกิดต้องไม่อยู่ในอนาคต",
  fail: "บันทึกวันเกิดไม่สำเร็จ ลองใหม่อีกครั้ง",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ emailErr?: string; email?: string; bdayErr?: string; bday?: string }> }) {
  const { actor, user } = await requireActor();
  const sp = await searchParams;
  const emailErr = Object.hasOwn(EMAIL_ERR_TEXT, sp.emailErr ?? "") ? EMAIL_ERR_TEXT[sp.emailErr as EmailChangeError] : null;
  const bdayErr = Object.hasOwn(BDAY_ERR_TEXT, sp.bdayErr ?? "") ? BDAY_ERR_TEXT[sp.bdayErr as string] : null;
  const myBday = await getMyBirthday(db(), user.id);
  const couple = await getCouple(db(), actor);
  const me = (await db().select({ character: users.character, prefs: users.notifyPrefs, reminderAt: users.checkinReminderTime }).from(users).where(eq(users.id, user.id)).get())!;
  const prefs = parsePrefs(me.prefs);
  const vapidPublicKey = (env as { VAPID_PUBLIC_KEY?: string }).VAPID_PUBLIC_KEY ?? null;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="ตั้งค่า" />
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-col">
            <CardTitle><UserRound className="size-4 text-primary" /> โปรไฟล์ของฉัน</CardTitle>
            <CardDescription>ชื่อนี้จะแสดงให้ {couple.partner?.name ?? "อีกฝ่าย"} เห็น ทั้งในแอป แจ้งเตือน และใน Claude</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <form action={updateNameAction} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="displayName">ชื่อเล่น</Label>
                <Input id="displayName" name="displayName" defaultValue={user.name} maxLength={40} required autoComplete="nickname" />
              </div>
              <p className="text-xs text-muted-foreground">อีเมลสำหรับล็อกอิน: {user.email}</p>
              <SubmitButton variant="secondary">บันทึกชื่อ</SubmitButton>
            </form>
            <form action={changeEmailAction} className="flex flex-col gap-3 border-t pt-4">
              {emailErr && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{emailErr}</p>}
              {sp.email && !emailErr && <p className="flex items-center gap-1 text-sm text-emerald-600"><Check className="size-4" /> เปลี่ยนอีเมลแล้ว</p>}
              <div className="flex flex-col gap-2">
                <Label htmlFor="newEmail">อีเมลใหม่</Label>
                <Input id="newEmail" name="newEmail" type="email" required maxLength={254} autoComplete="email" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="currentPassword">รหัสผ่านปัจจุบัน</Label>
                <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
              </div>
              <SubmitButton variant="secondary">เปลี่ยนอีเมล</SubmitButton>
            </form>
            <form action={updateBirthdayAction} className="flex flex-col gap-3 border-t pt-4">
              {bdayErr && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{bdayErr}</p>}
              {sp.bday && !bdayErr && <p className="flex items-center gap-1 text-sm text-emerald-600"><Check className="size-4" /> บันทึกวันเกิดแล้ว</p>}
              <div className="flex flex-col gap-2">
                <Label htmlFor="birthday">วันเกิด</Label>
                <Input id="birthday" name="birthday" type="date" defaultValue={myBday.birthday ?? ""} max={todayIn(appTz())} autoComplete="bday" />
                <p className="text-xs text-muted-foreground">เว้นว่างแล้วบันทึก = ล้างวันเกิด</p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="showBirthday" defaultChecked={myBday.show} className="mt-0.5 size-4 accent-primary" />
                <span>โชว์วันเกิดในปฏิทิน <span className="text-muted-foreground">(ปิด = ไม่มีใครเห็น รวมถึงตัวเอง และไม่มีแจ้งเตือน)</span></span>
              </label>
              <SubmitButton variant="secondary">บันทึกวันเกิด</SubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><Heart className="size-4 text-primary" /> พื้นที่ของเรา</CardTitle></CardHeader>
          <CardContent>
            <form action={updateCoupleAction} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2"><Label htmlFor="name">ชื่อพื้นที่</Label><Input id="name" name="name" defaultValue={couple.name} /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="anniversary">วันครบรอบ</Label><Input id="anniversary" name="anniversary" type="date" defaultValue={couple.anniversary ?? ""} /></div>
              <SubmitButton variant="secondary">บันทึก</SubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex-col">
            <CardTitle><PawPrint className="size-4 text-primary" /> ตัวละครของฉัน</CardTitle>
            <CardDescription>ตัวที่จะไปโผล่และพูดแทนเราบนจอของ {couple.partner?.name ?? "อีกฝ่าย"} และเป็นไอคอนในแจ้งเตือน</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={setCharacterAction} className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {CHARACTERS.map((c) => {
                const active = me.character === c.id;
                return (
                  <button
                    key={c.id}
                    name="character"
                    value={c.id}
                    aria-pressed={active}
                    className={cn("flex flex-col items-center gap-1 rounded-xl border p-2 text-sm transition-colors hover:border-primary", active && "border-primary bg-accent ring-2 ring-primary/30")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/characters/${c.id}.svg`} alt="" className="size-20" />
                    <span className="flex items-center gap-1 font-medium">{c.name}{active && <Check className="size-4 text-primary" />}</span>
                  </button>
                );
              })}
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex-col">
            <CardTitle><Bell className="size-4 text-primary" /> การแจ้งเตือน</CardTitle>
            <CardDescription>ต้องเปิดแยกในแต่ละเครื่อง · ช่วง 23:00–07:00 จะเก็บไว้ส่งตอนเช้า · ไม่โชว์เนื้อหาเช็กอินบนหน้าล็อก</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <PushSetup vapidPublicKey={vapidPublicKey} />
            <form action={updateNotifyPrefsAction} className="flex flex-col gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {NOTIFY_KINDS.map((k) => (
                  <label key={k.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={k.id} defaultChecked={prefs[k.id]} className="size-4 accent-primary" />
                    {k.label}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Label htmlFor="reminderTime">เตือนเช็กอินเวลา</Label>
                <NativeSelect id="reminderTime" name="reminderTime" defaultValue={me.reminderAt} className="w-28">
                  {REMINDER_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                </NativeSelect>
                <SubmitButton variant="secondary" size="sm" className="ml-auto">บันทึกการตั้งค่า</SubmitButton>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex-col">
            <CardTitle><Palette className="size-4 text-primary" /> ธีมของเรา</CardTitle>
            <CardDescription>เปลี่ยนแล้วทั้งสองคนจะเห็นธีมเดียวกัน</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateThemeAction} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {THEMES.map((t) => {
                const active = couple.theme === t.id;
                return (
                  <button
                    key={t.id}
                    name="theme"
                    value={t.id}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border p-3 text-left text-sm transition-colors hover:border-primary",
                      active && "border-primary ring-2 ring-primary/30",
                    )}
                  >
                    <span className="flex w-full overflow-hidden rounded-lg border" style={{ background: t.swatch[0] }}>
                      <span className="h-10 flex-1" style={{ background: t.swatch[0] }} />
                      <span className="h-10 flex-1" style={{ background: t.swatch[1] }} />
                      <span className="h-10 flex-1" style={{ background: t.swatch[2] }} />
                    </span>
                    <span className="flex w-full items-center justify-between gap-1 font-medium">
                      {t.name}
                      {active && <Check className="size-4 text-primary" />}
                    </span>
                  </button>
                );
              })}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-col">
            <CardTitle><Users className="size-4 text-primary" /> สมาชิก</CardTitle>
            <CardDescription>{couple.partner ? "ครบ 2 คนแล้ว 💕" : "ส่งโค้ดนี้ให้แฟน เพื่อเข้าร่วมพื้นที่เดียวกัน"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="text-sm">
              {couple.members.map((m) => <li key={m.id}>{m.name} <span className="text-muted-foreground">· {m.email}</span></li>)}
            </ul>
            {!couple.partner && (
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-center font-mono text-lg tracking-widest">{couple.inviteCode}</code>
                <form action={regenerateInviteAction}>
                  <Button variant="outline" size="icon" aria-label="สร้างโค้ดใหม่"><RefreshCw /></Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-col">
            <CardTitle><Bot className="size-4 text-primary" /> เชื่อมกับ Claude (MCP)</CardTitle>
            <CardDescription>ให้ Claude ช่วยดูสรุป เพิ่มนัด เพิ่มรายการ และจดบันทึกให้</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <code className="rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all">{origin}/mcp</code>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>ใน Claude เมนูซ้าย กด <span className="font-medium text-foreground">Plugins</span> → ปุ่ม <span className="font-medium text-foreground">Add</span> → <span className="font-medium text-foreground">Add custom connector</span></li>
              <li>ตั้งชื่อ <span className="font-medium text-foreground">Duo</span> แล้ววาง URL ด้านบน</li>
              <li>ถ้าให้เลือกการยืนยันตัวตน เลือก “Use Claude&apos;s published identity” (ไม่ต้องกรอก Client ID/Secret)</li>
              <li>กด Add → Connect → ล็อกอินบัญชี Duo นี้ แล้วกด “อนุญาต”</li>
              <li>ลองพิมพ์ใน Claude: “สรุปวันนี้ของเราจาก Duo หน่อย”</li>
            </ol>
            <p className="text-xs text-muted-foreground">บัญชี Claude แบบ Team/Enterprise: ให้ Owner เพิ่ม connector ให้องค์กรก่อน แล้วแต่ละคนกด Connect เอง · บัญชีฟรีเพิ่ม custom connector ได้ 1 ตัว · ชื่อเมนูใน Claude อาจเปลี่ยนตามเวอร์ชัน</p>
            <p className="text-muted-foreground">Claude Code: <code className="text-xs">claude mcp add --transport http duo {origin}/mcp</code></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-col">
            <CardTitle><Smartphone className="size-4 text-primary" /> ติดตั้งบนมือถือ</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">iPhone:</span> เปิดใน Safari → ปุ่มแชร์ → “เพิ่มไปยังหน้าจอโฮม”</p>
            <p><span className="font-medium text-foreground">Android:</span> เปิดใน Chrome → เมนู ⋮ → “ติดตั้งแอป”</p>
          </CardContent>
        </Card>
      </div>
      <form action={logoutAction}>
        <Button variant="outline"><LogOut /> ออกจากระบบ ({user.email})</Button>
      </form>
    </div>
  );
}
