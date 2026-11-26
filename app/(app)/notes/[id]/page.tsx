import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { deleteNoteAction, saveNoteAction } from "@/app/actions";
import { getCouple, getNote, NotFoundError } from "@/lib/core";
import { db, requireActor } from "@/lib/server";

export default async function NotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { actor } = await requireActor();
  const isNew = id === "new";
  const note = isNew ? null : await getNote(db(), actor, id).catch((e) => (e instanceof NotFoundError ? undefined : Promise.reject(e)));
  if (note === undefined) notFound();
  const couple = await getCouple(db(), actor);
  const mine = !note || note.authorId === actor.userId;
  const author = couple.members.find((m) => m.id === note?.authorId)?.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/notes" aria-label="กลับ"><ArrowLeft /></Link></Button>
        <h1 className="flex-1 text-xl font-semibold">{isNew ? "บันทึกใหม่" : "แก้ไขบันทึก"}</h1>
        {saved && <span className="flex items-center gap-1 text-sm text-emerald-600"><Check className="size-4" /> บันทึกแล้ว</span>}
      </div>
      <Card>
        <CardContent>
          <form action={saveNoteAction} className="flex flex-col gap-4">
            {note && <input type="hidden" name="id" value={note.id} />}
            <Input name="title" defaultValue={note?.title} placeholder="หัวข้อ" required className="text-lg font-medium" />
            <Textarea name="body" defaultValue={note?.body} placeholder="เขียนอะไรก็ได้..." className="min-h-72 leading-relaxed" />
            <div className="flex flex-wrap items-center gap-4">
              {mine ? (
                <div className="flex items-center gap-2">
                  <Label htmlFor="visibility">การมองเห็น</Label>
                  <NativeSelect id="visibility" name="visibility" defaultValue={note?.visibility ?? "shared"} className="w-40">
                    <option value="shared">แชร์กับแฟน</option>
                    <option value="private">ส่วนตัว (เห็นคนเดียว)</option>
                  </NativeSelect>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">เขียนโดย {author}</span>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="pinned" defaultChecked={note?.pinned} className="size-4 accent-primary" /> ปักหมุด
              </label>
              <SubmitButton className="ml-auto">บันทึก</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
      {note && mine && (
        <form action={deleteNoteAction} className="self-end">
          <input type="hidden" name="id" value={note.id} />
          <Button variant="ghost" size="sm" className="text-destructive"><Trash2 /> ลบบันทึกนี้</Button>
        </form>
      )}
    </div>
  );
}
