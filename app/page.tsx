import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarHeart, HeartPulse, ListChecks, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/lib/server";

// ทุกหน้าอ่าน cookie/ข้อมูลสด ห้าม prerender
export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: CalendarHeart, title: "ปฏิทินร่วม", text: "นัดเดต วันสำคัญ และกิจกรรมของเราสองคน" },
  { icon: ListChecks, title: "รายการร่วม", text: "งานบ้าน ของต้องซื้อ ที่อยากไป แบ่งกันทำ" },
  { icon: HeartPulse, title: "เช็กอินรายวัน", text: "บอกความรู้สึกทุกวัน เห็นของกันหลังตอบครบทั้งคู่" },
  { icon: Target, title: "แผนร่วมกัน", text: "ทริป เป้าหมาย และ milestone ที่ไปด้วยกัน" },
];

export default async function Home() {
  const user = await currentUser();
  if (user) redirect(user.coupleId ? "/dashboard" : "/onboarding");
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <div className="flex flex-col gap-4">
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          <Sparkles className="size-3.5" /> พื้นที่ของเราสองคน
        </span>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">ดูแลความสัมพันธ์ และจัดชีวิตร่วมกันในที่เดียว</h1>
        <p className="text-lg text-muted-foreground">ใช้ได้ทั้งบนมือถือ (ติดตั้งลงหน้าจอได้) บนเว็บ และสั่งงานผ่าน Claude ด้วย MCP</p>
        <div className="flex gap-3">
          <Button asChild size="lg"><Link href="/signup">เริ่มใช้งาน</Link></Button>
          <Button asChild size="lg" variant="outline"><Link href="/login">เข้าสู่ระบบ</Link></Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border bg-card p-5">
            <Icon className="mb-3 size-5 text-primary" />
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
