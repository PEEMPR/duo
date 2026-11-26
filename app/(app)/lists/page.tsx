import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { KIND_META } from "@/components/list-kinds";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { createListAction } from "@/app/actions";
import { getLists } from "@/lib/core";
import { db, requireActor } from "@/lib/server";


export default async function ListsPage() {
  const { actor } = await requireActor();
  const lists = await getLists(db(), actor);
  return (
    <div>
      <PageHeader title="รายการของเรา" description="แบ่งงาน แชร์ไอเดีย ทำไปด้วยกัน" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((l) => {
          const { icon: Icon, label } = KIND_META[l.kind];
          return (
            <Link key={l.id} href={`/lists/${l.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle><Icon className="size-4 text-primary" /> {l.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {label} · เหลือ {l.open} จาก {l.total}
                </CardContent>
              </Card>
            </Link>
          );
        })}
        <Card className="border-dashed">
          <CardContent>
            <form action={createListAction} className="flex flex-col gap-3">
              <Input name="name" placeholder="ชื่อรายการใหม่" required />
              <NativeSelect name="kind" defaultValue="todo">
                {Object.entries(KIND_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </NativeSelect>
              <SubmitButton variant="secondary">สร้างรายการ</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
