import Link from "next/link";
import { Heart } from "lucide-react";

// ทุกหน้าอ่าน cookie/ข้อมูลสด ห้าม prerender
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold">
          <Heart className="size-5 fill-primary text-primary" /> Duo
        </Link>
        {children}
      </div>
    </main>
  );
}
