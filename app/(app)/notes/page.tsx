import Link from "next/link";
import { Lock, Pin, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { listNotes } from "@/lib/core";
import { db, requireActor } from "@/lib/server";
import { formatDateTh, isoToLocalYmd } from "@/lib/time";

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { actor } = await requireActor();
  const { q } = await searchParams;
  const notes = await listNotes(db(), actor, { query: q });
  return (
    <div>
      <PageHeader title="บันทึก" description="ไดอารี่ ความทรงจำ และเรื่องที่อยากจดไว้">
        <Button asChild><Link href="/notes/new"><Plus /> บันทึกใหม่</Link></Button>
      </PageHeader>
      <form className="relative mb-4">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="ค้นหาบันทึก..." className="pl-9" />
      </form>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{q ? "ไม่พบบันทึกที่ค้นหา" : "ยังไม่มีบันทึก"}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <Link key={n.id} href={`/notes/${n.id}`}>
              <Card className="h-full gap-2 transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="min-w-0 text-base"><span className="truncate">{n.title}</span></CardTitle>
                  <span className="flex shrink-0 gap-1 text-muted-foreground">
                    {n.pinned && <Pin className="size-3.5" />}
                    {n.visibility === "private" && <Lock className="size-3.5" />}
                  </span>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="line-clamp-3 text-sm whitespace-pre-wrap text-muted-foreground">{n.body || "—"}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTh(isoToLocalYmd(n.updatedAt, actor.tz), { day: "numeric", month: "short", year: "numeric" })}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
