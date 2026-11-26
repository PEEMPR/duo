import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/submit-button";
import { addItemAction, deleteItemAction, deleteListAction, toggleItemAction } from "@/app/actions";
import { getCouple, getListWithItems, NotFoundError } from "@/lib/core";
import { db, requireActor } from "@/lib/server";
import { formatDateTh } from "@/lib/time";
import { cn } from "@/lib/utils";

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor } = await requireActor();
  const [list, couple] = await Promise.all([
    getListWithItems(db(), actor, id).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e))),
    getCouple(db(), actor),
  ]);
  if (!list || list.id !== id) notFound();
  const nameOf = (uid: string | null) => couple.members.find((m) => m.id === uid)?.name;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/lists" aria-label="กลับ"><ArrowLeft /></Link></Button>
        <h1 className="flex-1 truncate text-2xl font-semibold">{list.name}</h1>
        <form action={deleteListAction}>
          <input type="hidden" name="id" value={list.id} />
          <Button variant="ghost" size="sm" className="text-muted-foreground"><Trash2 /> ลบรายการ</Button>
        </form>
      </div>

      <Card>
        <CardContent>
          <form action={addItemAction} className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="listId" value={list.id} />
            <Input name="text" placeholder="เพิ่มรายการ..." required className="flex-1" />
            <NativeSelect name="assigneeId" defaultValue="" className="sm:w-36">
              <option value="">ไม่ระบุคน</option>
              {couple.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </NativeSelect>
            <Input name="dueDate" type="date" className="sm:w-40" />
            <SubmitButton>เพิ่ม</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <ul className="flex flex-col gap-2">
        {list.items.length === 0 && <li className="text-sm text-muted-foreground">ยังไม่มีอะไรในรายการนี้</li>}
        {list.items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
            <form action={toggleItemAction} className="flex">
              <input type="hidden" name="id" value={it.id} />
              <input type="hidden" name="done" value={it.done ? "0" : "1"} />
              <button aria-label={it.done ? "ยกเลิกเสร็จ" : "ทำเสร็จแล้ว"} className="flex">
                {it.done ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Circle className="size-5 text-muted-foreground hover:text-primary" />}
              </button>
            </form>
            <span className={cn("min-w-0 flex-1 truncate text-sm", it.done && "text-muted-foreground line-through")}>{it.text}</span>
            {it.dueDate && <Badge variant="outline">{formatDateTh(it.dueDate)}</Badge>}
            {nameOf(it.assigneeId) && <Badge variant="secondary">{nameOf(it.assigneeId)}</Badge>}
            <form action={deleteItemAction} className="flex">
              <input type="hidden" name="id" value={it.id} />
              <button aria-label="ลบ" className="flex text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
