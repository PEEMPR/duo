import { Heart } from "lucide-react";
import { BottomNav, MobileHeaderLinks, SideNav } from "@/components/app-nav";
import { getCouple } from "@/lib/core";
import { db, requireActor } from "@/lib/server";
import { isThemeId } from "@/lib/themes";

// ทุกหน้าอ่าน cookie/ข้อมูลสด ห้าม prerender
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { actor } = await requireActor();
  const couple = await getCouple(db(), actor);
  const theme = isThemeId(couple.theme) ? couple.theme : "rose";
  return (
    <div className={`theme-${theme} flex min-h-dvh bg-background text-foreground`} data-theme-preset={theme}>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-card/50 p-4 md:flex">
        <div className="flex items-center gap-2 px-2 pt-2 font-semibold">
          <Heart className="size-5 fill-primary text-primary" />
          <span className="truncate">{couple.name}</span>
        </div>
        <SideNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/90 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <Heart className="size-5 fill-primary text-primary" />
          <span className="truncate font-semibold">{couple.name}</span>
          <MobileHeaderLinks />
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-10">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
