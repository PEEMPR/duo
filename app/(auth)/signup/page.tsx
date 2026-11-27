import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/auth-form";
import { signupAction } from "@/app/actions";
import { appTz } from "@/lib/server";
import { todayIn } from "@/lib/time";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <Card>
      <CardHeader className="flex-col">
        <CardTitle className="text-xl">สมัครสมาชิก</CardTitle>
        <CardDescription>สร้างบัญชีของคุณ แล้วชวนอีกฝ่ายมาเข้าพื้นที่เดียวกัน</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ActionForm
          action={signupAction}
          hidden={next ? { next } : undefined}
          submit="สร้างบัญชี"
          fields={[
            { name: "name", label: "ชื่อเล่น", placeholder: "เช่น ME", autoComplete: "nickname" },
            { name: "birthday", label: "วันเกิด (ไม่ใส่ก็ได้)", type: "date", required: false, max: todayIn(appTz()), autoComplete: "bday", hint: "ใช้ปักหมุดในปฏิทิน ซ่อนได้ทีหลังในตั้งค่า" },
            { name: "email", label: "อีเมล", type: "email", autoComplete: "email" },
            { name: "password", label: "รหัสผ่าน (อย่างน้อย 8 ตัว)", type: "password", autoComplete: "new-password" },
          ]}
        />
        <p className="text-center text-sm text-muted-foreground">
          มีบัญชีแล้ว?{" "}
          <Link className="text-primary underline-offset-4 hover:underline" href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>
            เข้าสู่ระบบ
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
