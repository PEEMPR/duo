import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/auth-form";
import { loginAction } from "@/app/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <Card>
      <CardHeader className="flex-col">
        <CardTitle className="text-xl">เข้าสู่ระบบ</CardTitle>
        <CardDescription>ยินดีต้อนรับกลับมา 💕</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ActionForm
          action={loginAction}
          hidden={next ? { next } : undefined}
          submit="เข้าสู่ระบบ"
          fields={[
            { name: "email", label: "อีเมล", type: "email", autoComplete: "email" },
            { name: "password", label: "รหัสผ่าน", type: "password", autoComplete: "current-password" },
          ]}
        />
        <p className="text-center text-sm text-muted-foreground">
          ยังไม่มีบัญชี?{" "}
          <Link className="text-primary underline-offset-4 hover:underline" href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>
            สมัครสมาชิก
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
