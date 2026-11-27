import { redirect } from "next/navigation";
import { Heart, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/auth-form";
import { createCoupleAction, joinCoupleAction } from "@/app/actions";
import { requireUser } from "@/lib/server";

// ทุกหน้าอ่าน cookie/ข้อมูลสด ห้าม prerender
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.coupleId) redirect("/calendar");
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-5 py-10">
      <div>
        <h1 className="text-2xl font-semibold">สวัสดี {user.name} 👋</h1>
        <p className="mt-1 text-muted-foreground">สร้างพื้นที่ของคู่คุณ หรือเข้าร่วมด้วยโค้ดเชิญจากอีกฝ่าย</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-col">
            <CardTitle><Heart className="size-4 text-primary" /> สร้างพื้นที่ใหม่</CardTitle>
            <CardDescription>แล้วส่งโค้ดเชิญให้แฟนเข้าร่วม</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={createCoupleAction}
              submit="สร้างพื้นที่"
              fields={[
                { name: "name", label: "ชื่อพื้นที่", placeholder: "เช่น ME & You" },
                { name: "anniversary", label: "วันครบรอบ (ไม่บังคับ)", type: "date", required: false },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-col">
            <CardTitle><UserPlus className="size-4 text-primary" /> เข้าร่วมด้วยโค้ดเชิญ</CardTitle>
            <CardDescription>ขอโค้ดจากหน้า ตั้งค่า ของอีกฝ่าย</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={joinCoupleAction} submit="เข้าร่วม" fields={[{ name: "code", label: "โค้ดเชิญ", placeholder: "ABCD2345" }]} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
