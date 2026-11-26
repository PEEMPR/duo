import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { addMilestoneAction, createPlanAction, deletePlanAction, planStatusAction, toggleMilestoneAction } from "@/app/actions";
import { getPlans } from "@/lib/core";
import { db, requireActor } from "@/lib/server";
import { formatDateTh } from "@/lib/time";
import { cn } from "@/lib/utils";

const STATUS = { idea: "ไอเดีย", planning: "กำลังวางแผน", doing: "กำลังทำ", done: "สำเร็จแล้ว" } as const;

export default async function PlansPage() {
  const { actor } = await requireActor();
  const plans = await getPlans(db(), actor);
  return (
    <div>
      <PageHeader title="แผนของเรา" description="ทริป เป้าหมาย และสิ่งที่อยากทำด้วยกัน" />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {plans.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีแผน เริ่มสร้างแผนแรกได้ทางด้านขวาเลย</p>}
          {plans.map((p) => {
            const done = p.milestones.filter((m) => m.done).length;
            return (
              <Card key={p.id} className={cn(p.status === "done" && "opacity-70")}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="text-base">{p.title}</CardTitle>
                    <CardDescription className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge variant={p.status === "doing" ? "default" : "secondary"}>{STATUS[p.status]}</Badge>
                      {p.targetDate && <span>เป้าหมาย {formatDateTh(p.targetDate, { day: "numeric", month: "short", year: "numeric" })}</span>}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <form action={planStatusAction} className="flex gap-1">
                      <input type="hidden" name="id" value={p.id} />
                      <NativeSelect name="status" defaultValue={p.status} className="h-8 w-32 text-xs">
                        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </NativeSelect>
                      <Button size="sm" variant="outline">เปลี่ยน</Button>
                    </form>
                    <form action={deletePlanAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button size="icon" variant="ghost" className="size-8" aria-label="ลบแผน"><Trash2 className="text-muted-foreground" /></Button>
                    </form>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {p.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.description}</p>}
                  {p.milestones.length > 0 && (
                    <>
                      <div className="flex items-center gap-3">
                        <Progress value={(done / p.milestones.length) * 100} />
                        <span className="shrink-0 text-xs text-muted-foreground">{done}/{p.milestones.length}</span>
                      </div>
                      <ul className="flex flex-col gap-1">
                        {p.milestones.map((m) => (
                          <li key={m.id} className="flex items-center gap-2 text-sm">
                            <form action={toggleMilestoneAction} className="flex">
                              <input type="hidden" name="id" value={m.id} />
                              <input type="hidden" name="done" value={m.done ? "0" : "1"} />
                              <button className="flex" aria-label="สลับสถานะ">
                                {m.done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-muted-foreground hover:text-primary" />}
                              </button>
                            </form>
                            <span className={cn(m.done && "text-muted-foreground line-through")}>{m.title}</span>
                            {m.dueDate && <span className="ml-auto text-xs text-muted-foreground">{formatDateTh(m.dueDate)}</span>}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <form action={addMilestoneAction} className="flex gap-2">
                    <input type="hidden" name="planId" value={p.id} />
                    <Input name="title" placeholder="เพิ่ม milestone..." className="h-8 text-sm" required />
                    <Button size="sm" variant="secondary" aria-label="เพิ่ม"><Plus /></Button>
                  </form>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>สร้างแผนใหม่</CardTitle></CardHeader>
          <CardContent>
            <form action={createPlanAction} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2"><Label htmlFor="title">ชื่อแผน</Label><Input id="title" name="title" required placeholder="เช่น ทริปเชียงใหม่ ปีใหม่" /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="targetDate">วันเป้าหมาย</Label><Input id="targetDate" name="targetDate" type="date" /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="description">รายละเอียด</Label><Textarea id="description" name="description" /></div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="milestones">Milestones (บรรทัดละ 1 ข้อ)</Label>
                <Textarea id="milestones" name="milestones" placeholder={"จองตั๋ว\nจองที่พัก\nวางแผนเที่ยว"} />
              </div>
              <SubmitButton>สร้างแผน</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
