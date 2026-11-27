"use client";

import Link from "next/link";
import { History, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RoomState } from "@/lib/core/pet";
import { cn } from "@/lib/utils";

type Memory = NonNullable<RoomState["memory"]>;

const AUTO_HIDE_MS = 12_000;

/**
 * ลูกโป่งความทรงจำ "ปีที่แล้ววันนี้" ของน้องฉัน: แบบประหยัดพื้นที่ (กรอบประ พื้นการ์ดจาง)
 * - จำข้อความไว้ในเครื่อง: server คืน null หลังเห็นแล้ว จึงยังแสดงต่อจนกว่าผู้ใช้ปิดหรือครบ 12 วิ
 * - onSeen(id) เรียกครั้งเดียวตอนแสดงครั้งแรก
 * - ไม่มีการเรียก server ในคอมโพเนนต์นี้
 */
export function MemoryBubble({ memory, onSeen }: { memory: RoomState["memory"]; onSeen: (id: string) => void }) {
  const [current, setCurrent] = useState<Memory | null>(memory);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [enteredId, setEnteredId] = useState<string | null>(null);
  const notified = useRef(new Set<string>());
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;

  // จำข้อความที่มาใหม่ไว้ (ไม่ทับของเดิมที่ยังแสดงอยู่ด้วย id เดียวกัน)
  useEffect(() => {
    if (memory) setCurrent((prev) => (prev?.id === memory.id ? prev : memory));
  }, [memory]);

  const id = current?.id;
  const visible = current !== null && id !== dismissedId;

  // แจ้ง server ว่าเห็นแล้ว (ครั้งเดียวต่อ id)
  useEffect(() => {
    if (!visible || !id) return;
    if (notified.current.has(id)) return;
    notified.current.add(id);
    onSeenRef.current(id);
  }, [visible, id]);

  // ซ่อนอัตโนมัติหลัง 12 วินาที
  useEffect(() => {
    if (!visible || !id) return;
    const t = window.setTimeout(() => setDismissedId(id), AUTO_HIDE_MS);
    return () => window.clearTimeout(t);
  }, [visible, id]);

  // เฟดเข้า (เฉพาะเมื่อผู้ใช้ไม่ได้ตั้ง reduced motion: ดูคลาส motion-safe)
  useEffect(() => {
    if (!visible || !id) return;
    const r = window.requestAnimationFrame(() => setEnteredId(id));
    return () => window.cancelAnimationFrame(r);
  }, [visible, id]);

  if (!visible || !current) return null;

  const text = current.text;

  return (
    <aside
      aria-label="ปีที่แล้ววันนี้"
      className={cn(
        "relative w-[92%] rounded-2xl border border-dashed border-muted-foreground/40 bg-card/90 py-2 pr-7 pl-3 text-card-foreground shadow-sm backdrop-blur-sm",
        "motion-safe:opacity-0 motion-safe:transition-opacity motion-safe:duration-500",
        enteredId === current.id && "motion-safe:opacity-100",
      )}
    >
      <div className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <History className="size-3" aria-hidden />
        ปีที่แล้ววันนี้
      </div>
      {current.href ? (
        <Link href={current.href} className="line-clamp-3 text-sm leading-snug underline-offset-4 hover:underline">
          {text}
        </Link>
      ) : (
        <p className="line-clamp-3 text-sm leading-snug">{text}</p>
      )}
      <button
        type="button"
        aria-label="ปิด"
        onClick={() => setDismissedId(current.id)}
        className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3" aria-hidden />
      </button>
      <span aria-hidden className="absolute -bottom-1.5 left-6 size-3 rotate-45 border-r border-b border-dashed border-muted-foreground/40 bg-card" />
    </aside>
  );
}
