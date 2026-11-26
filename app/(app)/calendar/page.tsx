import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { createEventAction, deleteEventAction } from "@/app/actions";
import { eventDays, listEvents } from "@/lib/core";
import { db, requireActor } from "@/lib/server";
import { addDays, formatDateTh, formatEventRange, todayIn } from "@/lib/time";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function monthShift(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string; err?: string }> }) {
  const { actor } = await requireActor();
  const sp = await searchParams;
  const today = todayIn(actor.tz);
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : today;
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : selected.slice(0, 7);

  const first = `${month}-01`;
  const startOffset = new Date(`${first}T00:00:00Z`).getUTCDay();
  const gridStart = addDays(first, -startOffset);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const evts = await listEvents(db(), actor, { from: cells[0], to: cells[41] });
  const byDay = new Map<string, typeof evts>();
  for (const e of evts) {
    for (const k of eventDays(e, actor.tz)) byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const dayEvents = byDay.get(selected) ?? [];

  return (
    <div>
      <PageHeader title="ปฏิทินของเรา" description="นัดหมายและวันสำคัญร่วมกัน" />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="gap-3">
          <CardHeader className="items-center">
            <CardTitle className="text-lg">{formatDateTh(first, { month: "long", year: "numeric" })}</CardTitle>
            <div className="flex gap-1">
              <Button asChild variant="ghost" size="icon"><Link href={`/calendar?m=${monthShift(month, -1)}&d=${selected}`} aria-label="เดือนก่อน"><ChevronLeft /></Link></Button>
              <Button asChild variant="outline" size="sm"><Link href={`/calendar?d=${today}`}>วันนี้</Link></Button>
              <Button asChild variant="ghost" size="icon"><Link href={`/calendar?m=${monthShift(month, 1)}&d=${selected}`} aria-label="เดือนถัดไป"><ChevronRight /></Link></Button>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
              {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d) => {
                const inMonth = d.startsWith(month);
                const list = byDay.get(d) ?? [];
                return (
                  <Link
                    key={d}
                    href={`/calendar?m=${month}&d=${d}`}
                    className={cn(
                      "flex min-h-14 flex-col rounded-lg border border-transparent p-1 text-xs transition-colors hover:bg-accent sm:min-h-20",
                      !inMonth && "text-muted-foreground/50",
                      d === selected && "border-primary bg-accent",
                    )}
                  >
                    <span className={cn("mx-auto flex size-6 items-center justify-center rounded-full", d === today && "bg-primary text-primary-foreground")}>{Number(d.slice(8))}</span>
                    <div className="mt-0.5 hidden flex-col gap-0.5 sm:flex">
                      {list.slice(0, 2).map((e) => <span key={e.id} className="truncate rounded bg-primary/10 px-1 text-[10px] text-primary">{e.title}</span>)}
                      {list.length > 2 && <span className="text-[10px] text-muted-foreground">+{list.length - 2}</span>}
                    </div>
                    {list.length > 0 && <span className="mx-auto mt-1 size-1.5 rounded-full bg-primary sm:hidden" />}
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader><CardTitle>{formatDateTh(selected, { weekday: "long", day: "numeric", month: "long" })}</CardTitle></CardHeader>
            <CardContent>
              {dayEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">ไม่มีนัดในวันนี้</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {dayEvents.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{e.title}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3 shrink-0" />
                          {formatEventRange(e, actor.tz)}
                        </p>
                        {e.location && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" />{e.location}</p>}
                        {e.description && <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{e.description}</p>}
                      </div>
                      <form action={deleteEventAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <Button variant="ghost" size="icon" aria-label="ลบ"><Trash2 className="text-muted-foreground" /></Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>เพิ่มนัด</CardTitle></CardHeader>
            <CardContent>
              <form action={createEventAction} className="flex flex-col gap-3">
                {sp.err && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{sp.err}</p>}
                <div className="flex flex-col gap-2"><Label htmlFor="title">ชื่อนัด</Label><Input id="title" name="title" required placeholder="เช่น ดินเนอร์ครบรอบ" /></div>
                <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                  <div className="flex flex-col gap-2"><Label htmlFor="date">วันเริ่ม</Label><Input id="date" name="date" type="date" defaultValue={selected} required /></div>
                  <div className="flex flex-col gap-2"><Label htmlFor="time">เวลาเริ่ม</Label><Input id="time" name="time" type="time" /></div>
                  <div className="flex flex-col gap-2"><Label htmlFor="endDate">วันสิ้นสุด</Label><Input id="endDate" name="endDate" type="date" /></div>
                  <div className="flex flex-col gap-2"><Label htmlFor="endTime">เวลาสิ้นสุด</Label><Input id="endTime" name="endTime" type="time" /></div>
                </div>
                <p className="-mt-1 text-xs text-muted-foreground">ไม่ใส่วันสิ้นสุด = จบในวันเดียว · ไม่ใส่เวลาเลย = ทั้งวัน (หลายวันก็ได้ เช่น ทริป 3 วัน)</p>
                <div className="flex flex-col gap-2"><Label htmlFor="location">สถานที่</Label><Input id="location" name="location" /></div>
                <div className="flex flex-col gap-2"><Label htmlFor="description">รายละเอียด</Label><Textarea id="description" name="description" /></div>
                <SubmitButton>บันทึกนัด</SubmitButton>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
