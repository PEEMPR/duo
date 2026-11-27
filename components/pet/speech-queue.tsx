"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomQueueItem } from "@/lib/core/pet";
import { cn } from "@/lib/utils";

const TYPE_MS = 30;
const AUTO_MS = 8000;

/** แยกข้อความเป็นตัวอักษรที่มองเห็น (ไทยมีสระ/วรรณยุกต์ซ้อน → ใช้ grapheme ถ้ามี) */
function graphemes(s: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) return Array.from(new Seg("th", { granularity: "grapheme" }).segment(s), (x) => x.segment);
  return Array.from(s);
}

/**
 * ลูกโป่งคำพูดของน้องอีกฝ่าย: แสดงทีละข้อ · ครั้งแรกพิมพ์ทีละตัว (ข้อที่เห็นแล้ว/replay/ลดการเคลื่อนไหว = แสดงทันที)
 * · ‹ ย้อนกลับ (หยุด auto-advance) · ตัวนับ · ต่อไป › / ปิด · auto-advance 8 วิ
 * remount (เปลี่ยน key) เพื่อเปิดคิวใหม่
 */
export function SpeechQueue({
  items,
  start = 0,
  replay = false,
  reducedMotion = false,
  speaker,
  onShown,
  onClose,
  className,
}: {
  items: RoomQueueItem[];
  start?: number;
  /** เปิดซ้ำ (แตะน้อง) → ทุกข้อแสดงทันที */
  replay?: boolean;
  reducedMotion?: boolean;
  /** ชื่อผู้พูด ใช้กับ aria-label */
  speaker: string;
  /** เรียกเมื่อข้อนั้นถูกแสดง (ครั้งแรกของการเปิดนี้) */
  onShown: (item: RoomQueueItem) => void;
  onClose: () => void;
  className?: string;
}) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, start), Math.max(0, items.length - 1)));
  const [paused, setPaused] = useState(false);
  const item = items[index] as RoomQueueItem | undefined;
  const chars = useMemo(() => (item ? graphemes(item.text) : []), [item?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const [shownChars, setShownChars] = useState(0);
  const shownIds = useRef(new Set<string>());
  const onShownRef = useRef(onShown);
  onShownRef.current = onShown;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // live region เดียว: ใส่ข้อความเต็มหลัง mount (region ที่มีข้อความตั้งแต่ mount มักไม่ถูกอ่าน)
  const [liveText, setLiveText] = useState("");

  const total = items.length;
  const isLast = index >= total - 1;
  const typingDone = shownChars >= chars.length;

  // แสดงข้อใหม่: ตัดสินใจว่าจะพิมพ์หรือแสดงทันที (อ่านค่า seen ก่อนแจ้ง onShown)
  const itemId = item?.id;
  useEffect(() => {
    if (!item) return;
    const first = !shownIds.current.has(item.id);
    const type = first && !item.seen && !replay && !reducedMotion;
    shownIds.current.add(item.id);
    if (first) onShownRef.current(item);
    setLiveText(item.text);
    const n = graphemes(item.text).length;
    if (!type) {
      setShownChars(n);
      return;
    }
    setShownChars(0);
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setShownChars(i);
      if (i >= n) window.clearInterval(t);
    }, TYPE_MS);
    return () => window.clearInterval(t);
  }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // auto-advance หลังพิมพ์จบ 8 วิ (ยกเว้นกดย้อนกลับแล้ว หรือเป็นข้อสุดท้าย)
  useEffect(() => {
    if (paused || !typingDone || isLast || !item) return;
    const t = window.setTimeout(() => setIndex((i) => Math.min(i + 1, total - 1)), AUTO_MS);
    return () => window.clearTimeout(t);
  }, [paused, typingDone, isLast, itemId, total]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape = ปิด (ลูกโป่งไม่ใช่ modal จึงไม่จับโฟกัส)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // คิวหดลง (เช่น ข้อมูลใหม่จาก server) → ไม่ให้ index หลุด
  useEffect(() => {
    if (total > 0 && index > total - 1) setIndex(total - 1);
  }, [total, index]);

  if (!item) return null;

  const text = typingDone ? item.text : chars.slice(0, shownChars).join("");
  const body = (
    <>
      <span aria-hidden>{text}</span>
      {!typingDone && <span className="pet-caret ml-0.5 inline-block h-[1em] w-px translate-y-[0.15em] bg-current" aria-hidden />}
    </>
  );

  const next = () => {
    if (!typingDone) {
      setShownChars(chars.length); // กดระหว่างพิมพ์ = แสดงทั้งข้อก่อน
      return;
    }
    if (isLast) onCloseRef.current();
    else setIndex((i) => i + 1);
  };
  const back = () => {
    setPaused(true);
    setShownChars(chars.length);
    setIndex((i) => Math.max(0, i - 1));
  };

  return (
    <div
      role="group"
      aria-label={`ข้อความจาก${speaker}`}
      className={cn(
        "pet-bubble-in relative rounded-2xl border bg-card/95 p-3 text-card-foreground shadow-lg backdrop-blur-sm",
        className,
      )}
    >
      {/* ข้อความครบสำหรับ screen reader ที่เดียว (ข้อความที่พิมพ์ทีละตัวด้านล่าง aria-hidden) */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveText}
      </p>
      <div className="max-h-[9.5rem] overflow-y-auto text-[15px] leading-relaxed break-words">
        {item.href ? (
          <Link href={item.href} className="block rounded-md outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            {body}
            <span className="sr-only">เปิดดูรายละเอียด</span>
            <span className="ml-1 text-xs text-primary" aria-hidden>
              ดู ›
            </span>
          </Link>
        ) : (
          <p>{body}</p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={back}
          disabled={index === 0}
          className="rounded-full px-2 py-1 text-muted-foreground hover:bg-accent disabled:opacity-40"
          aria-label="ย้อนกลับ"
        >
          ‹ ย้อนกลับ
        </button>
        <span className="tabular-nums text-muted-foreground">
          <span aria-hidden>
            {index + 1}/{total}
          </span>
          <span className="sr-only">
            ข้อ {index + 1} จาก {total}
          </span>
        </span>
        <button
          type="button"
          onClick={next}
          className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground hover:bg-primary/90"
        >
          {isLast && typingDone ? "ปิด" : "ต่อไป ›"}
        </button>
      </div>
      {/* หางลูกโป่ง ชี้ลงหาน้อง (ฝั่งขวา) */}
      <span
        aria-hidden
        className="absolute -bottom-2 right-[22%] size-4 rotate-45 border-r border-b bg-card"
      />
    </div>
  );
}
