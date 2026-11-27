"use client";

import Link from "next/link";
import { Palette } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { RoomId, RoomPet, RoomQueueItem, RoomState } from "@/lib/core/pet";
import { getRoomStateAction, markSeenAction, setRoomAction } from "@/app/(app)/room/actions";
import { useRoomSocket } from "@/lib/realtime/client";
import { cn } from "@/lib/utils";
import { ActionsBar } from "./actions-bar";
import { usePetBehavior, type PetBehavior } from "./behaviors";
import { MemoryBubble } from "./memory-bubble";
import { PetSprite } from "./pet-sprite";
import { ROOM_META, RoomScene } from "./rooms";
import { SpeechQueue } from "./speech-queue";

const ROOMS = Object.keys(ROOM_META) as RoomId[];
const WALK_MS = 2000;
const LONG_PRESS_MS = 500;
const SEEN_FLUSH_MS = 800;
/** socket ต่อติด (onopen) ไม่ต้อง refetch ถ้าเพิ่ง fetch ไป (SSR ตอน mount นับด้วย) */
const OPEN_REFETCH_MIN_MS = 3000;
/** หลังเราทำเอง (กอด/ขนม/เปลี่ยนห้อง) ไม่ต้อง refetch ตาม poke ที่สะท้อนกลับมา */
const OWN_ECHO_MS = 2000;
/** boost กอด/ขนม 30 นาที (+1 นาทีกันคลาด) */
const BOOST_REFRESH_MS = 31 * 60_000;

type Phase = "hidden" | "walking" | "here";
type QueueOpen = { key: number; start: number; replay: boolean };

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

function localDay(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA").format(new Date());
  }
}

/** core กำลังเพิ่ม `target` (ขนมป้อนน้องตัวไหน จากมุมผู้ดู) — รองรับทั้งก่อน/หลัง */
type QItem = RoomQueueItem & { target?: "me" | "partner" | null };

/** ms จนถึงขอบเวลาท้องถิ่นถัดไป 07:00 / 23:00 (น้องหลับ/ตื่น) */
function msToNightBoundary(tz: string, now = new Date()): number {
  let h = 0, m = 0, sec = 0;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    h = get("hour") % 24; m = get("minute"); sec = get("second");
  } catch {
    h = now.getHours(); m = now.getMinutes(); sec = now.getSeconds();
  }
  const s = h * 3600 + m * 60 + sec;
  const wait = (target: number) => (((target - s) % 86400) + 86400) % 86400 || 86400;
  return Math.min(wait(7 * 3600), wait(23 * 3600)) * 1000 - now.getMilliseconds();
}

const firstUnseen = (q: RoomQueueItem[]) => q.findIndex((i) => !i.seen);

/** ปุ่มน้อง: แตะ / กดค้าง (กดค้างใช้เมื่อ behavior มี onLongPress) */
function PetButton({
  pet,
  behavior,
  label,
  title,
  flip,
  onTap,
  children,
}: {
  pet: RoomPet;
  behavior: PetBehavior;
  label: string;
  title: string;
  flip?: boolean;
  onTap?: () => void;
  children?: ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);
  const clear = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const longPress = behavior.onLongPress;
  return (
    <button
      type="button"
      aria-label={label}
      className={cn("relative block size-full touch-manipulation rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-ring", behavior.className)}
      style={{ WebkitTouchCallout: "none" }}
      onContextMenu={longPress ? (e) => e.preventDefault() : undefined}
      onPointerDown={
        longPress
          ? () => {
              longFired.current = false;
              clear();
              timer.current = window.setTimeout(() => {
                longFired.current = true;
                longPress();
              }, LONG_PRESS_MS);
            }
          : undefined
      }
      onPointerUp={longPress ? clear : undefined}
      onPointerLeave={longPress ? clear : undefined}
      onPointerCancel={longPress ? clear : undefined}
      onClick={() => {
        if (longFired.current) {
          longFired.current = false;
          return;
        }
        behavior.onTap?.();
        onTap?.();
      }}
    >
      <PetSprite
        character={pet.character}
        mood={behavior.mood ?? pet.mood}
        pose={behavior.pose ?? pet.pose}
        flip={flip}
        title={title}
        className="pointer-events-none size-full"
      />
      {behavior.overlay}
      {children}
    </button>
  );
}

/** ปุ่มเลือกห้องเล็กๆ มุมขวาบนของฉาก → popover รายชื่อห้อง */
function RoomPicker({ room, onPick }: { room: RoomId; onPick: (r: RoomId) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div
      ref={wrap}
      className="absolute top-[2%] right-[2%] z-20"
      onBlur={(e) => {
        // relatedTarget=null (Safari ไม่โฟกัสปุ่มตอนคลิก) ปล่อยให้ pointerdown-outside จัดการ
        if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={btn}
        type="button"
        aria-label={`เปลี่ยนห้อง (${ROOM_META[room].label})`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="flex size-11 items-center justify-center rounded-full border bg-background/80 text-foreground shadow-sm backdrop-blur outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Palette className="size-5" aria-hidden />
      </button>
      {open && (
        <div id={menuId} role="group" aria-label="เลือกห้อง" className="absolute top-12 right-0 flex w-44 flex-col gap-0.5 rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-lg">
          {ROOMS.map((id) => {
            const meta = ROOM_META[id];
            const selected = room === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  onPick(id);
                  setOpen(false);
                  btn.current?.focus();
                }}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "bg-accent font-medium",
                )}
              >
                <span
                  aria-hidden
                  className={cn("size-6 shrink-0 rounded-full border", selected && "ring-2 ring-primary ring-offset-1 ring-offset-background")}
                  style={{ background: `linear-gradient(135deg, ${meta.swatch[0]}, ${meta.swatch[1]})` }}
                />
                <span className="flex-1 text-left">{meta.label}</span>
                {selected && <span aria-hidden className="text-primary">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RoomClient({ initial, tz }: { initial: RoomState; tz: string }) {
  const reduced = useReducedMotion();
  const localSeen = useRef(new Set<string>());
  const overlay = useCallback(
    (s: RoomState): RoomState =>
      localSeen.current.size ? { ...s, queue: s.queue.map((i) => (i.seen || !localSeen.current.has(i.id) ? i : { ...i, seen: true })) } : s,
    [],
  );

  const [state, setState] = useState<RoomState>(initial);
  const stateRef = useRef(state);
  stateRef.current = state;

  // น้องอีกฝ่าย: เดินเข้ามาถ้ามีเรื่องใหม่ที่ยังไม่เห็น ไม่งั้นยืนรออยู่แล้ว
  const [phase, setPhase] = useState<Phase>(() => (initial.partner?.present ? (firstUnseen(initial.queue) >= 0 ? "walking" : "here") : "hidden"));
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [queue, setQueue] = useState<QueueOpen | null>(null);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const queueKey = useRef(0);
  const [roomError, setRoomError] = useState(false);

  const openQueue = useCallback((start: number, replay: boolean) => {
    queueKey.current += 1;
    setQueue({ key: queueKey.current, start, replay });
  }, []);

  /* ── seen: รวมเป็นชุดก่อนส่ง ── */
  const pendingSeen = useRef(new Set<string>());
  const flushTimer = useRef<number | null>(null);
  const flushSeen = useCallback(() => {
    if (flushTimer.current != null) window.clearTimeout(flushTimer.current);
    flushTimer.current = null;
    const ids = [...pendingSeen.current];
    pendingSeen.current.clear();
    if (ids.length) markSeenAction(ids).catch(() => ids.forEach((id) => localSeen.current.delete(id)));
  }, []);
  const queueSeen = useCallback(
    (id: string) => {
      if (localSeen.current.has(id)) return;
      localSeen.current.add(id);
      pendingSeen.current.add(id);
      if (flushTimer.current == null) flushTimer.current = window.setTimeout(flushSeen, SEEN_FLUSH_MS);
    },
    [flushSeen],
  );
  useEffect(() => {
    const onHide = () => flushSeen();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flushSeen();
    };
  }, [flushSeen]);

  const onShown = useCallback(
    (item: RoomQueueItem) => {
      if (!item.seen) queueSeen(item.id);
      setState((s) => ({ ...s, queue: s.queue.map((i) => (i.id === item.id && !i.seen ? { ...i, seen: true } : i)) }));
    },
    [queueSeen],
  );

  /* ── กิจกรรมสดของอีกฝ่าย (hug/miss/treat) → แจ้ง behaviors ผ่าน window event "duo-pet" ── */
  const pendingPetEvents = useRef<{ type: RoomQueueItem["kind"]; target: "me" | "partner" }[]>([]);
  const dispatchPetEvents = useCallback(() => {
    const evs = pendingPetEvents.current;
    pendingPetEvents.current = [];
    for (const { type, target } of evs) window.dispatchEvent(new CustomEvent("duo-pet", { detail: { type, from: "partner", target } }));
  }, []);

  /* ── ใช้ state ใหม่จาก server: ตัดสินใจเดินเข้า / เปิดคิว ── */
  const apply = useCallback(
    (raw: RoomState) => {
      const next = overlay(raw);
      // queue = กิจกรรมของอีกฝ่ายเท่านั้น → hug/miss/treat ของเราเองไม่ถูกส่งซ้ำ (actions bar ส่ง from:"me" เอง)
      const prevIds = new Set(stateRef.current.queue.map((i) => i.id));
      for (const i of next.queue) {
        if (!prevIds.has(i.id) && (i.kind === "hug" || i.kind === "miss" || i.kind === "treat"))
          // target = มุมมองของผู้ดู (core) · ไม่มี = น้องของเรา
          pendingPetEvents.current.push({ type: i.kind, target: (i as QItem).target === "partner" ? "partner" : "me" });
      }
      stateRef.current = next;
      setState(next);
      if (!next.partner?.present) {
        pendingPetEvents.current = [];
        phaseRef.current = "hidden";
        setPhase("hidden");
        setQueue(null);
        return;
      }
      const unseen = firstUnseen(next.queue);
      if (phaseRef.current === "hidden") {
        const walk = unseen >= 0;
        phaseRef.current = walk ? "walking" : "here";
        setPhase(phaseRef.current);
        if (!walk) dispatchPetEvents();
      } else if (phaseRef.current === "here") {
        if (unseen >= 0 && !queueRef.current) openQueue(unseen, false);
        dispatchPetEvents();
      }
      // walking: เมื่อเดินถึงจะเปิดคิวและส่ง event ที่ค้างไว้เอง (arrive)
    },
    [overlay, openQueue, dispatchPetEvents],
  );

  // หน้า server render ใหม่ (เช่น router.refresh) → รับค่าใหม่
  // (เทียบเนื้อหา: หน้าปฏิทินเปลี่ยน ?month= แล้ว server ส่ง initial ก้อนใหม่ที่เหมือนเดิม → ไม่ต้อง apply)
  const lastInitialSig = useRef<string | null>(null);
  useEffect(() => {
    const sig = JSON.stringify(initial);
    if (lastInitialSig.current === null) {
      lastInitialSig.current = sig;
      return;
    }
    if (sig === lastInitialSig.current) return;
    lastInitialSig.current = sig;
    apply(initial);
  }, [initial, apply]);

  /* ── refetch (กันยิงซ้อน) ── */
  const inFlight = useRef(false);
  const again = useRef(false);
  const lastFetch = useRef(Date.now()); // SSR initial = fetch ตอน mount
  const refetch = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    lastFetch.current = Date.now();
    try {
      apply(await getRoomStateAction());
    } catch {
      /* ออฟไลน์/หลุด: รอรอบถัดไป */
    } finally {
      inFlight.current = false;
      if (again.current) {
        again.current = false;
        void refetch();
      }
    }
  }, [apply]);

  // ข้อความที่ hook ส่งตอน onopen มาก่อน render ที่ connected = true → ใช้แยก "ต่อติด" ออกจาก poke จริง
  const connectedRef = useRef(false);
  const muteUntil = useRef(0);
  const onSocket = useCallback(() => {
    const now = Date.now();
    if (!connectedRef.current) {
      if (now - lastFetch.current < OPEN_REFETCH_MIN_MS) return;
    } else if (now < muteUntil.current) {
      return; // poke จากแอ็กชันของเราเอง
    }
    void refetch();
  }, [refetch]);
  const { connected } = useRoomSocket(onSocket);
  connectedRef.current = connected;

  /* ── หลังแอ็กชันของเราเอง: ปิดเสียง poke สะท้อน · กอด/ขนม → refetch ตอน boost หมด ── */
  const [ownBoostAt, setOwnBoostAt] = useState(0);
  useEffect(() => {
    const onPet = (e: Event) => {
      const d = (e as CustomEvent<{ type?: string; from?: string }>).detail;
      if (d?.from !== "me") return;
      muteUntil.current = Date.now() + OWN_ECHO_MS;
      if (d.type === "hug" || d.type === "treat") setOwnBoostAt(Date.now() + BOOST_REFRESH_MS);
    };
    window.addEventListener("duo-pet", onPet);
    return () => window.removeEventListener("duo-pet", onPet);
  }, []);

  /* ── refetch ตามเวลา: ขอบ 23:00/07:00 (หลับ/ตื่น) และตอน boost กอด/ขนมหมด ── */
  useEffect(() => {
    const now = Date.now();
    let wait = msToNightBoundary(tz) + 5000;
    const boosts = [ownBoostAt, ...state.queue.filter((i) => i.kind === "hug" || i.kind === "treat").map((i) => Date.parse(i.at) + BOOST_REFRESH_MS)];
    for (const at of boosts) if (Number.isFinite(at) && at > now) wait = Math.min(wait, at - now);
    const t = window.setTimeout(() => {
      if (document.visibilityState === "visible") void refetch();
      else lastFetch.current = 0; // ซ่อนอยู่ → refetch ตอนกลับมาแสดง
    }, Math.min(wait, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [state, ownBoostAt, tz, refetch]);

  useEffect(() => {
    const maybe = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetch.current > 2000) void refetch();
    };
    window.addEventListener("focus", maybe);
    document.addEventListener("visibilitychange", maybe);
    // ข้ามเที่ยงคืน (วันใหม่ = รีเซ็ตน้องอีกฝ่าย)
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible" && localDay(tz) !== stateRef.current.today) void refetch();
    }, 60_000);
    return () => {
      window.removeEventListener("focus", maybe);
      document.removeEventListener("visibilitychange", maybe);
      window.clearInterval(t);
    };
  }, [refetch, tz]);

  /* ── เดินเข้า ── */
  const arrive = useCallback(() => {
    if (phaseRef.current !== "walking") return;
    phaseRef.current = "here";
    setPhase("here");
    const unseen = firstUnseen(stateRef.current.queue);
    if (unseen >= 0 && !queueRef.current) openQueue(unseen, false);
    dispatchPetEvents();
  }, [openQueue, dispatchPetEvents]);
  useEffect(() => {
    if (phase !== "walking") return;
    // ลดการเคลื่อนไหว = ถึงทันที · ไม่งั้นรอ animationend (มี timeout กันพลาด)
    const t = window.setTimeout(arrive, reduced ? 0 : WALK_MS + 150);
    return () => window.clearTimeout(t);
  }, [phase, reduced, arrive]);

  /* ── เปลี่ยนห้อง (optimistic) ── */
  const pickRoom = (room: RoomId) => {
    const prev = stateRef.current.room;
    if (room === prev) return;
    setRoomError(false);
    muteUntil.current = Date.now() + OWN_ECHO_MS;
    setState((s) => ({ ...s, room }));
    setRoomAction(room)
      .then((r) => {
        if (!r.ok) throw new Error();
      })
      .catch(() => {
        setState((s) => (s.room === room ? { ...s, room: prev } : s));
        setRoomError(true);
      });
  };

  const { me, partner } = state;
  const partnerName = partner?.name || "อีกฝ่าย";
  const myBehavior = usePetBehavior(me, { role: "me", reducedMotion: reduced });
  const partnerBehavior = usePetBehavior(partner ?? me, { role: "partner", busy: phase === "walking" || !!queue, reducedMotion: reduced });

  const replay = () => {
    if (phaseRef.current !== "here" || !stateRef.current.queue.length) return;
    openQueue(0, true);
  };

  const showPartner = !!partner?.present && phase !== "hidden";

  return (
    <div className="flex flex-col gap-4">
      {/* ฉาก 390:520 · wrapper ไม่ clip เพื่อให้ popover เลือกห้องล้นออกได้ */}
      <div className="relative">
      <div className="relative aspect-[390/520] w-full overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="absolute inset-0" aria-hidden>
          <RoomScene room={state.room} />
        </div>

        {/* น้องของฉัน: ครึ่งซ้ายของพื้น (y ≈ 380–500) */}
        <div className="absolute bottom-[3%] left-[6%] aspect-square w-[32%]">
          <PetButton pet={me} behavior={myBehavior} label="น้องของฉัน" title="น้องของฉัน" />
        </div>
        <div className="absolute top-[4%] left-[3%] w-[60%]">
          <MemoryBubble memory={state.memory} onSeen={queueSeen} />
        </div>

        {/* น้องของอีกฝ่าย: ครึ่งขวา · เดินเข้าจากขอบขวา */}
        {showPartner && partner && (
          <div
            className={cn("absolute right-[6%] bottom-[3%] aspect-square w-[32%]", phase === "walking" && !reduced && "pet-walk-in")}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) arrive();
            }}
          >
            <div className={cn("size-full", phase === "walking" && !reduced && "pet-bob")}>
              <PetButton
                pet={partner}
                behavior={partnerBehavior}
                flip
                title={`น้องของ ${partnerName}`}
                label={state.queue.length ? `น้องของ ${partnerName} — แตะเพื่อฟังเรื่องวันนี้อีกครั้ง` : `น้องของ ${partnerName}`}
                onTap={replay}
              />
            </div>
          </div>
        )}

        {showPartner && phase === "here" && queue && state.queue.length > 0 && (
          <div className="absolute right-[3%] bottom-[33%] w-[78%] max-w-[22rem]">
            <SpeechQueue
              key={queue.key}
              items={state.queue}
              start={queue.start}
              replay={queue.replay}
              reducedMotion={reduced}
              speaker={`น้องของ ${partnerName}`}
              onShown={onShown}
              onClose={() => setQueue(null)}
            />
          </div>
        )}
      </div>
      <RoomPicker room={state.room} onPick={pickRoom} />
      </div>

      {/* สถานะอีกฝ่าย */}
      {!partner ? (
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/settings" className="underline-offset-4 hover:underline">
            ชวนอีกฝ่ายเข้าคู่ในตั้งค่า
          </Link>
        </p>
      ) : !partner.present ? (
        <p className="text-center text-sm text-muted-foreground">วันนี้ {partnerName} ยังไม่ได้แวะมา</p>
      ) : null}

      {roomError && (
        <p role="alert" className="-mt-2 text-center text-xs text-destructive">
          เปลี่ยนห้องไม่สำเร็จ ลองอีกครั้งนะ
        </p>
      )}

      <ActionsBar state={state} onChange={setState} />
    </div>
  );
}
