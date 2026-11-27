"use client";

import { CircleHelp } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** คำแนะนำครั้งแรก + ปุ่มช่วยเหลือของห้องน้อง (ข้อความทุกข้อตรวจกับ lib/core/pet.ts และ behaviors.tsx แล้ว) */

const STORAGE_KEY = "duo.roomGuide.v1";
/** storage ใช้ไม่ได้ (throw) → แสดงอย่างมากหนึ่งครั้งต่อการโหลดหน้า */
let finishedThisLoad = false;

export type GuideTarget = "picker" | "actions" | null;

const STEPS: { text: string; target: GuideTarget }[] = [
  { text: "ห้องนี้เป็นห้องเดียวกันของเราสองคน 🏠 กด 🎨 มุมขวาบนเพื่อเปลี่ยนห้อง (เปลี่ยนให้ทั้งคู่)", target: "picker" },
  { text: "แตะน้องให้กระโดด · กดค้างเพื่อลูบหัว 🫳", target: null },
  {
    text: "วันไหนอีกฝ่ายทำอะไรในแอป (เช็กอิน เพิ่มนัด ฝากงาน เขียนบันทึกที่แชร์…) น้องของเขาจะเดินมาเล่าให้ฟัง แตะน้องเขาเพื่อฟังซ้ำ · ต้องเช็กอินก่อน ถึงจะรู้ว่าเขาเช็กอินว่าอะไร 🤫",
    target: null,
  },
  { text: "ส่งกอด 🤗 / คิดถึง 💗 ได้ทุก 1 นาที · ติ๊กรายการว่าเสร็จได้ขนม 🍪 (วันละ 5 ชิ้น) เอาไว้ป้อนน้อง", target: "actions" },
];

const EXTRA_TIPS = [
  "น้องหลับช่วง 23:00–07:00 💤 (แตะตอนหลับ น้องจะตื่นแป๊บเดียว)",
  "ไม่ได้เช็กอิน 3 วันน้องจะหงอย 7 วันจะนอนขด — ไปเดินทางหรือป่วย เปิด “โหมดพัก” ในตั้งค่าได้",
  "ถ้าวันนี้น้องดูเศร้าหรือง่วง (ตามอารมณ์ที่เช็กอิน) พอได้กอดหรือขนม น้องจะดีใจขึ้นอยู่ 30 นาที",
  "ถ้าปีที่แล้ววันนี้เรามีนัด บันทึก หรือแผนที่สำเร็จ จะมีกรอบ “ปีที่แล้ววันนี้” โผล่ที่มุมซ้ายบน",
];

function readDone(): "done" | "new" | "unavailable" {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "done" ? "done" : "new";
  } catch {
    return "unavailable";
  }
}

export type RoomGuideState = {
  /** คำแนะนำกำลังเดินอยู่ (หลัง mount เท่านั้น) */
  active: boolean;
  step: number;
  total: number;
  next: () => void;
  skip: () => void;
  restart: () => void;
};

export function useRoomGuide(): RoomGuideState {
  const [active, setActive] = useState(false); // SSR + first client render = ไม่แสดง (กัน hydration mismatch)
  const [step, setStep] = useState(0);

  useEffect(() => {
    const r = readDone();
    if (r === "new" || (r === "unavailable" && !finishedThisLoad)) setActive(true);
  }, []);

  const finish = useCallback(() => {
    finishedThisLoad = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* ไม่เก็บถาวร: finishedThisLoad กันแสดงซ้ำในหน้านี้ */
    }
    setActive(false);
    setStep(0);
  }, []);

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) finish();
    else setStep(step + 1);
  }, [step, finish]);

  const restart = useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);

  return { active, step, total: STEPS.length, next, skip: finish, restart };
}

/** การ์ดคำแนะนำ (ไม่ modal ไม่จับโฟกัส) · blocked = น้องกำลังเดินเข้า/ลูกโป่งคำพูดเปิดอยู่ → รอ */
export function RoomGuideCard({ guide, blocked, reducedMotion }: { guide: RoomGuideState; blocked: boolean; reducedMotion: boolean }) {
  if (!guide.active || blocked) return null;
  const last = guide.step >= guide.total - 1;
  const btn =
    "inline-flex min-h-11 touch-manipulation items-center justify-center rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div
      role="group"
      aria-label="คำแนะนำ"
      className={cn("rounded-2xl border bg-card p-3 text-card-foreground shadow-sm", !reducedMotion && "pet-bubble-in")}
    >
      <p aria-live="polite" className="text-sm leading-relaxed">
        {STEPS[guide.step].text}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">
          <span aria-hidden>
            {guide.step + 1}/{guide.total}
          </span>
          <span className="sr-only">
            ข้อ {guide.step + 1} จาก {guide.total}
          </span>
        </span>
        <div className="flex items-center gap-1">
          {!last && (
            <button type="button" onClick={guide.skip} className={cn(btn, "text-muted-foreground hover:bg-accent")}>
              ข้าม
            </button>
          )}
          <button type="button" onClick={guide.next} className={cn(btn, "bg-primary text-primary-foreground hover:bg-primary/90")}>
            {last ? "เริ่มเลย" : "ถัดไป"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** ไฮไลต์ตัวควบคุมที่เกี่ยวกับข้อปัจจุบัน (เฉพาะตอนการ์ดแสดงอยู่) */
export function guideTarget(guide: RoomGuideState, blocked: boolean): GuideTarget {
  return guide.active && !blocked ? STEPS[guide.step].target : null;
}

/** ปุ่ม ❓ ซ้ายของปุ่มเลือกห้อง → แผงวิธีเล่น */
export function RoomHelp({ open, onOpenChange, onRestart }: { open: boolean; onOpenChange: (o: boolean) => void; onRestart: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault(); // กัน SpeechQueue ปิดตามไปด้วย
        onOpenChange(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);
  const tips = [...STEPS.map((s) => s.text), ...EXTRA_TIPS];
  return (
    <div
      ref={wrap}
      // ปุ่มเลือกห้อง = right 2% กว้าง 44px (2.75rem) + ช่องว่าง 0.5rem
      className="absolute top-[2%] right-[calc(2%+3.25rem)] z-20"
      onBlur={(e) => {
        if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) onOpenChange(false);
      }}
    >
      <button
        ref={btn}
        type="button"
        aria-label="วิธีเล่นกับน้อง"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className="flex size-11 items-center justify-center rounded-full border bg-background/80 text-foreground shadow-sm backdrop-blur outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CircleHelp className="size-5" aria-hidden />
      </button>
      {open && (
        // กว้างยึดขอบขวาของฉาก (ชดเชยปุ่มเลือกห้องด้วย -right-[3.25rem])
        <div
          id={panelId}
          role="group"
          aria-labelledby={titleId}
          className="absolute top-12 -right-[3.25rem] flex max-h-[min(26rem,70vh)] w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto rounded-2xl border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <h2 id={titleId} className="text-sm font-semibold">
            วิธีเล่นกับน้อง
          </h2>
          <ul className="flex flex-col gap-2 text-sm leading-relaxed">
            {tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden className="text-muted-foreground">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              onRestart();
              onOpenChange(false);
              btn.current?.focus();
            }}
            className="mt-1 min-h-11 touch-manipulation rounded-full border px-4 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            ดูคำแนะนำอีกครั้ง
          </button>
        </div>
      )}
    </div>
  );
}
