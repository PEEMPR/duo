import { Cake } from "lucide-react";
import type { BirthdayPin } from "@/lib/core";

export function birthdayLabel(b: Pick<BirthdayPin, "name" | "isMe">) {
  return `วันเกิด ${b.name}${b.isMe ? " (ฉัน)" : ""}`;
}

/** แถววันเกิดในรายการของวัน — ไม่มีปุ่มลบ ไม่แสดงอายุ */
export function BirthdayRow({ pin }: { pin: BirthdayPin }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-pink-300/60 bg-pink-100/60 p-3 text-sm dark:border-pink-400/30 dark:bg-pink-500/10">
      <Cake className="mt-0.5 size-4 shrink-0 text-pink-600 dark:text-pink-300" aria-label="วันเกิด" role="img" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">🎂 {birthdayLabel(pin)}</p>
        {pin.isMe && <p className="mt-1 text-xs text-muted-foreground">แก้ได้ที่ ตั้งค่า → โปรไฟล์</p>}
      </div>
    </li>
  );
}
