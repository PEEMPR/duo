import Link from "next/link";
import { ArrowRight, Cake, CalendarHeart, CheckCircle2, Circle, Flame, HeartPulse, NotebookPen, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { moodEmoji } from "@/components/mood";
import { toggleItemAction } from "@/app/actions";
import { getSummary } from "@/lib/core";
import { db, requireActor } from "@/lib/server";
import { daysBetween, formatDateTh, formatEventRange, formatTime, isoToLocalYmd } from "@/lib/time";

export default async function Dashboard() {
  const { actor } = await requireActor();
  const s = await getSummary(db(), actor);
  const tz = actor.tz;
  const together = s.couple.anniversary ? daysBetween(s.couple.anniversary, s.today) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-muted-foreground">{formatDateTh(s.today, { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          สวัสดี {s.couple.me.name}
          {s.couple.partner ? ` & ${s.couple.partner.name}` : ""} 💕
        </h1>
        {together !== null && together >= 0 && <p className="mt-1 text-sm text-muted-foreground">อยู่ด้วยกันมา {together.toLocaleString("th-TH")} วันแล้ว</p>}
        {!s.couple.partner && (
          <p className="mt-2 text-sm">
            ยังไม่มีอีกฝ่ายในพื้นที่นี้ —{" "}
            <Link href="/settings" className="text-primary underline-offset-4 hover:underline">ส่งโค้ดเชิญ</Link>
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle><HeartPulse className="size-4 text-primary" /> เช็กอินวันนี้</CardTitle>
            <Badge variant="secondary"><Flame className="text-orange-500" /> {s.checkin.streak} วัน</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Status label="คุณ" done={s.checkin.doneByMe} />
              <Status label={s.couple.partner?.name ?? "อีกฝ่าย"} done={s.checkin.doneByPartner} />
            </div>
            {s.checkin.partnerToday?.need && (
              <p className="rounded-lg bg-accent px-3 py-2 text-sm">
                <span className="font-medium">{s.couple.partner?.name} อยากได้:</span> {s.checkin.partnerToday.need}
              </p>
            )}
            <div className="flex items-end justify-between gap-1">
              {s.checkin.moods.map((m) => (
                <div key={m.date} className="flex flex-1 flex-col items-center gap-1 text-xs text-muted-foreground">
                  <span className="text-lg leading-none">{moodEmoji(m.mine)}</span>
                  <span className="text-lg leading-none">{moodEmoji(m.partner)}</span>
                  <span>{formatDateTh(m.date, { weekday: "narrow" })}</span>
                </div>
              ))}
            </div>
            {!s.checkin.doneByMe && <Button asChild><Link href="/checkin">เช็กอินเลย</Link></Button>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><CalendarHeart className="size-4 text-primary" /> 7 วันข้างหน้า</CardTitle>
            <Link href="/calendar" className="text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /></Link>
          </CardHeader>
          <CardContent>
            {s.birthdays.length > 0 && (
              <div className="mb-3 flex flex-col gap-1.5 border-b pb-3">
              <p className="text-xs font-medium text-muted-foreground">🎂 วันเกิดที่กำลังมา (30 วัน)</p>
              <ul className="flex flex-col gap-1">
                {s.birthdays.map((b) => {
                  const n = daysBetween(s.today, b.date);
                  return (
                    <li key={b.userId} className="flex items-center gap-2 rounded-lg bg-pink-100/60 px-3 py-2 text-sm dark:bg-pink-500/10">
                      <Cake className="size-4 shrink-0 text-pink-600 dark:text-pink-300" role="img" aria-label="วันเกิด" />
                      <span className="min-w-0 truncate">🎂 วันเกิด {b.name}{b.isMe ? " (ฉัน)" : ""} · {formatDateTh(b.date, { day: "numeric", month: "short" })}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{n <= 0 ? "วันนี้!" : `อีก ${n} วัน`}</span>
                    </li>
                  );
                })}
              </ul>
              </div>
            )}
            {s.upcomingEvents.length === 0 ? (
              <Empty text="ยังไม่มีนัด ลองวางแผนเดตกันไหม?" href="/calendar" cta="เพิ่มนัด" />
            ) : (
              <ul className="flex flex-col divide-y">
                {s.upcomingEvents.slice(0, 6).map((e) => {
                  const startDay = isoToLocalYmd(e.startAt, tz);
                  const ongoing = startDay < s.today;
                  const multiDay = !!e.endAt && isoToLocalYmd(e.endAt, tz) !== startDay;
                  return (
                    <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                      <div className="w-16 shrink-0 text-xs text-muted-foreground">
                        {ongoing ? "กำลังอยู่" : formatDateTh(startDay, { weekday: "short", day: "numeric" })}
                        <div>{ongoing ? "ในช่วงนัด" : e.allDay ? "ทั้งวัน" : formatTime(e.startAt, tz)}</div>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{e.title}</p>
                        {multiDay && <p className="truncate text-xs text-muted-foreground">{formatEventRange(e, tz)}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><CheckCircle2 className="size-4 text-primary" /> งานที่ค้าง</CardTitle>
            <Link href="/lists" className="text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /></Link>
          </CardHeader>
          <CardContent>
            {s.openItems.length === 0 ? (
              <Empty text="ไม่มีงานค้าง เยี่ยมมาก ✨" />
            ) : (
              <ul className="flex flex-col gap-1">
                {s.openItems.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-sm">
                    <form action={toggleItemAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="done" value="1" />
                      <button className="flex text-muted-foreground hover:text-primary" aria-label="ทำเสร็จแล้ว"><Circle className="size-4" /></button>
                    </form>
                    <span className="truncate">{i.text}</span>
                    <Badge variant="outline" className="ml-auto">{i.listName}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><Target className="size-4 text-primary" /> แผนของเรา</CardTitle>
            <Link href="/plans" className="text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /></Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {s.activePlans.length === 0 ? (
              <Empty text="ยังไม่มีแผน เริ่มจากทริปถัดไปก็ได้" href="/plans" cta="สร้างแผน" />
            ) : (
              s.activePlans.map((p) => {
                const done = p.milestones.filter((m) => m.done).length;
                const pct = p.milestones.length ? (done / p.milestones.length) * 100 : 0;
                return (
                  <div key={p.id} className="flex flex-col gap-1.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="truncate font-medium">{p.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{done}/{p.milestones.length}</span>
                    </div>
                    <Progress value={pct} />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {s.recentNotes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle><NotebookPen className="size-4 text-primary" /> บันทึกล่าสุด</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {s.recentNotes.map((n) => (
              <Button key={n.id} asChild variant="secondary" size="sm"><Link href={`/notes/${n.id}`}>{n.title}</Link></Button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Status({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
      {done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-muted-foreground" />}
      <span className="truncate">{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">{done ? "แล้ว" : "ยัง"}</span>
    </div>
  );
}

function Empty({ text, href, cta }: { text: string; href?: string; cta?: string }) {
  return (
    <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
      {text}
      {href && cta && <Button asChild size="sm" variant="outline"><Link href={href}>{cta}</Link></Button>}
    </div>
  );
}
