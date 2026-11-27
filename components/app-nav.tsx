"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarHeart, HeartPulse, Home, ListChecks, NotebookPen, PawPrint, Settings, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/dashboard", label: "ภาพรวม", icon: Home },
  { href: "/room", label: "ห้องน้อง", icon: PawPrint },
  { href: "/calendar", label: "ปฏิทิน", icon: CalendarHeart },
  { href: "/lists", label: "รายการ", icon: ListChecks },
  { href: "/checkin", label: "เช็กอิน", icon: HeartPulse },
  { href: "/plans", label: "แผน", icon: Target },
  { href: "/notes", label: "บันทึก", icon: NotebookPen },
  { href: "/settings", label: "ตั้งค่า", icon: Settings },
];

const MOBILE = ["/dashboard", "/calendar", "/lists", "/checkin", "/notes"];

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
            path.startsWith(href) && "bg-accent font-medium text-accent-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {NAV.filter((n) => MOBILE.includes(n.href)).map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link key={href} href={href} className={cn("flex flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground", active && "text-primary")}>
              <Icon className={cn("size-5", active && "fill-primary/15")} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** ไอคอนมุมขวาบน (มือถือ): หน้าที่ไม่อยู่ในแถบล่าง */
export function MobileHeaderLinks() {
  const path = usePathname();
  const links = [
    { href: "/room", label: "ห้องน้อง", icon: PawPrint },
    { href: "/plans", label: "แผน", icon: Target },
    { href: "/settings", label: "ตั้งค่า / ออกจากระบบ", icon: Settings },
  ];
  return (
    <div className="ml-auto flex items-center gap-1">
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-label={label}
          className={cn("flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent", path.startsWith(href) && "bg-accent text-primary")}
        >
          <Icon className="size-5" />
        </Link>
      ))}
    </div>
  );
}
