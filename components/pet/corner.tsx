"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { checkCornerNew } from "@/app/(app)/corner-actions";
import { PetSprite } from "@/components/pet/pet-sprite";

const THROTTLE_MS = 60_000;
const hiddenPath = (p: string) => p.startsWith("/room") || p.startsWith("/calendar");

export function PetCorner({ character, enabled, hasNew: initialNew }: { character: string | null; enabled: boolean; hasNew: boolean }) {
  const path = usePathname();
  const [hasNew, setHasNew] = useState(initialNew);
  const last = useRef(Date.now()); // server layout เพิ่งเช็กให้
  const quietUntil = useRef(0); // หลังออกจากห้อง: ไม่เชื่อ prop ชั่วคราว (markSeen อาจยังไม่ commit)
  const wasHidden = useRef(false);
  const hidden = !enabled || hiddenPath(path);

  // ซิงก์ค่าสดจาก server layout (render ใหม่ทุก soft nav)
  useEffect(() => {
    if (Date.now() >= quietUntil.current) setHasNew(initialNew);
  }, [initialNew]);

  // ออกจากห้อง/ปฏิทิน: ล้างจุด รอ 3 วิให้ markSeen commit แล้วเช็กครั้งเดียว
  useEffect(() => {
    if (!enabled) return;
    if (hiddenPath(path)) {
      wasHidden.current = true;
      setHasNew(false);
      return;
    }
    if (!wasHidden.current) return;
    wasHidden.current = false;
    quietUntil.current = Date.now() + 3000;
    setHasNew(false);
    let alive = true;
    const t = setTimeout(() => {
      last.current = Date.now();
      checkCornerNew().then((v) => alive && setHasNew(v)).catch(() => {});
    }, 3000);
    return () => { alive = false; clearTimeout(t); };
  }, [path, enabled]);

  // กลับมาที่แท็บ → เช็ก (throttle 60 วิ)
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const onVis = () => {
      if (document.visibilityState !== "visible" || hiddenPath(window.location.pathname)) return;
      const now = Date.now();
      if (now - last.current < THROTTLE_MS || now < quietUntil.current) return;
      last.current = now;
      checkCornerNew().then((v) => alive && setHasNew(v)).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); };
  }, [enabled]);

  if (hidden) return null;
  return (
    <Link
      href="/room"
      aria-label={hasNew ? "ไปห้องของน้อง (มีเรื่องใหม่)" : "ไปห้องของน้อง"}
      className="fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex size-16 items-center justify-center rounded-full bg-card/80 shadow-md ring-1 ring-border backdrop-blur transition-transform active:scale-95 md:right-5 md:bottom-5"
    >
      <span className="pet-bob block" style={{ animationDuration: "2.4s" }}>
        <PetSprite character={character} mood="happy" pose="stand" size={52} />
      </span>
      {hasNew ? <span aria-hidden className="absolute top-0.5 right-0.5 size-3.5 rounded-full bg-primary ring-2 ring-background" /> : null}
    </Link>
  );
}
