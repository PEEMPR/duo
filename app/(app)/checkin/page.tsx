import { EyeOff, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MOODS, moodEmoji } from "@/components/mood";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { checkinAction } from "@/app/actions";
import { checkinStreak, getCheckins, getCouple } from "@/lib/core";
import { db, requireActor } from "@/lib/server";
import { formatDateTh } from "@/lib/time";

const ENERGY = ["🪫", "😪", "🙂", "⚡", "🔥"];

function Scale({ name, options, value }: { name: string; options: readonly string[]; value?: number }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {options.map((o, i) => (
        <label key={i} className="cursor-pointer">
          <input type="radio" name={name} value={i + 1} defaultChecked={value === i + 1} required className="peer sr-only" />
          <span className="flex h-12 items-center justify-center rounded-lg border text-2xl transition-all peer-checked:border-primary peer-checked:bg-accent peer-checked:ring-2 peer-checked:ring-primary/30 peer-focus-visible:ring-2">
            {o}
          </span>
        </label>
      ))}
    </div>
  );
}

export default async function CheckinPage() {
  const { actor } = await requireActor();
  const [{ days }, streak, couple] = await Promise.all([getCheckins(db(), actor, 14), checkinStreak(db(), actor), getCouple(db(), actor)]);
  const today = days[0];
  const partnerName = couple.partner?.name ?? "อีกฝ่าย";

  return (
    <div>
      <PageHeader title="เช็กอินประจำวัน" description="ใช้เวลาแค่ 1 นาที เพื่อให้รู้ใจกันมากขึ้น">
        <Badge variant="secondary" className="text-sm"><Flame className="text-orange-500" /> ต่อเนื่อง {streak} วัน</Badge>
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-col">
            <CardTitle>{today.mine ? "แก้ไขเช็กอินวันนี้" : "วันนี้เป็นยังไงบ้าง?"}</CardTitle>
            <CardDescription>{partnerName} จะเห็นคำตอบของคุณหลังจากตอบของตัวเองแล้ว (และคุณก็เช่นกัน)</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={checkinAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2"><Label>อารมณ์</Label><Scale name="mood" options={MOODS} value={today.mine?.mood} /></div>
              <div className="flex flex-col gap-2"><Label>พลังงาน</Label><Scale name="energy" options={ENERGY} value={today.mine?.energy} /></div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="gratitude">วันนี้ขอบคุณอะไร / ขอบคุณ{partnerName}เรื่องอะไร</Label>
                <Textarea id="gratitude" name="gratitude" defaultValue={today.mine?.gratitude ?? ""} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="need">วันนี้อยากได้อะไรจาก{partnerName}</Label>
                <Textarea id="need" name="need" placeholder="เช่น อยากให้กอดเยอะ ๆ, ขอเวลาเงียบ ๆ สักพัก" defaultValue={today.mine?.need ?? ""} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="note">โน้ตเพิ่มเติม</Label>
                <Textarea id="note" name="note" defaultValue={today.mine?.note ?? ""} />
              </div>
              <SubmitButton>{today.mine ? "อัปเดต" : "เช็กอิน"}</SubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>14 วันที่ผ่านมา</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {days.map((d) => (
                <li key={d.date} className="flex flex-col gap-1.5 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">{formatDateTh(d.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                    <span title="คุณ" className="text-xl">{moodEmoji(d.mine?.mood)}</span>
                    <span title={partnerName} className="text-xl">
                      {d.partnerHidden ? <EyeOff className="size-4 text-muted-foreground" /> : moodEmoji(d.partner?.mood)}
                    </span>
                    {d.partnerHidden && <span className="text-xs text-muted-foreground">{partnerName}ตอบแล้ว — เช็กอินเพื่อดู</span>}
                  </div>
                  {d.partner?.need && <p className="ml-23 text-xs"><span className="text-muted-foreground">{partnerName} อยากได้:</span> {d.partner.need}</p>}
                  {d.partner?.gratitude && <p className="ml-23 text-xs"><span className="text-muted-foreground">{partnerName} ขอบคุณ:</span> {d.partner.gratitude}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
