import { headers } from "next/headers";
import { Bot, Check, Heart, LogOut, Palette, RefreshCw, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { logoutAction, regenerateInviteAction, updateCoupleAction, updateThemeAction } from "@/app/actions";
import { getCouple } from "@/lib/core";
import { db, requireActor } from "@/lib/server";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";

export default async function SettingsPage() {
  const { actor, user } = await requireActor();
  const couple = await getCouple(db(), actor);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="ตั้งค่า" />
      <div className="grid gap-5 md:grid-cols-2">
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
