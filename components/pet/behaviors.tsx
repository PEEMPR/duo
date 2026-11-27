"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { PetMood, PetPose, RoomPet } from "@/lib/core/pet";

/**
 * Client-only pet life (S8).
 *
 * window CustomEvent "duo-pet":
 *   detail: { type: "hug" | "miss" | "treat"; from: "me" | "partner"; target?: "me" | "partner" }
 *   - hug   : pet of `from` runs to the other pet (if shown & awake); both show love + hearts
 *   - miss  : hearts float from the pet of `from`
 *   - treat : pet of `target` (default: the other side of `from`) chomps happily with a 🍪
 *   Dispatch with: window.dispatchEvent(new CustomEvent("duo-pet", { detail }))
 *
 * No per-frame state: everything animates in CSS ("pet behaviors" block in globals.css);
 * React state changes only when an action starts / ends (a few times a minute at most).
 */
export type PetBehaviorOptions = {
  role: "me" | "partner";
  /** true while the pet walks in or speaks — behaviours should stay calm */
  busy?: boolean;
  reducedMotion?: boolean;
};

export type PetBehavior = {
  className: string;
  mood?: PetMood;
  pose?: PetPose;
  onTap?: () => void;
  onLongPress?: () => void;
  overlay?: ReactNode;
};

export type DuoPetEventDetail = { type: "hug" | "miss" | "treat"; from: "me" | "partner"; target?: "me" | "partner" };

type Role = "me" | "partner";
type Act = { kind: "none" | "idle" | "fx"; cls: string; mood?: PetMood; pose?: PetPose; hearts?: boolean; cookie?: boolean };
type Spec = Omit<Act, "kind"> & { ms: number; idle?: boolean };
type Latest = { userId: string; asleep: boolean; busy: boolean; reduced: boolean; ghost: boolean };
type Entry = { ref: MutableRefObject<Latest>; play: (s: Spec) => void; isFx: () => boolean };

const NONE: Act = { kind: "none", cls: "" };
const reg = new Map<Role, Entry>();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function active(role: Role): Entry | null {
  const e = reg.get(role);
  if (!e) return null;
  if (role === "partner") {
    const me = reg.get("me");
    if (e.ref.current.ghost || (me && me.ref.current.userId === e.ref.current.userId)) return null;
  }
  return e;
}
const other = (r: Role): Role => (r === "me" ? "partner" : "me");
const free = (e: Entry | null | undefined): e is Entry => !!e && !e.ref.current.asleep && !e.ref.current.busy && !e.isFx();

const BLINKS = ["pet-b-blink-a", "pet-b-blink-b", "pet-b-blink-c"];
const IDLES: Spec[] = [
  { cls: "pet-b-look", ms: 1700 },
  { cls: "pet-b-hop", ms: 800 },
  { cls: "pet-b-wiggle", ms: 1100 },
  { cls: "pet-b-sit", ms: 5000 },
];

function Hearts() {
  return (
    <span aria-hidden className="pet-b-fx">
      <span className="pet-b-heart" style={{ left: "28%", animationDelay: "0s" }}>💗</span>
      <span className="pet-b-heart" style={{ left: "52%", animationDelay: "0.35s" }}>💕</span>
      <span className="pet-b-heart" style={{ left: "70%", animationDelay: "0.7s" }}>💗</span>
    </span>
  );
}
function Cookie() {
  return (
    <span aria-hidden className="pet-b-fx">
      <span className="pet-b-cookie">🍪</span>
    </span>
  );
}

export function usePetBehavior(pet: RoomPet, opts?: PetBehaviorOptions): PetBehavior {
  const role: Role = opts?.role ?? "me";
  const reduced = !!opts?.reducedMotion;
  const asleep = pet.pose !== "stand";
  const ghost = role === "partner" && (pet as { present?: boolean }).present === false;

  const latest = useRef<Latest>({ userId: pet.userId, asleep, busy: !!opts?.busy, reduced, ghost });
  latest.current = { userId: pet.userId, asleep, busy: !!opts?.busy, reduced, ghost };

  const [act, setAct] = useState<Act>(NONE);
  const actRef = useRef<Act>(NONE);
  const timers = useRef(new Set<number>());
  const actTimer = useRef<number | null>(null);
  const [blinkCls, setBlinkCls] = useState(role === "me" ? BLINKS[0] : BLINKS[1]);
  useEffect(() => setBlinkCls(pick(BLINKS)), []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);

  const play = useCallback(
    (s: Spec) => {
      const l = latest.current;
      const a: Act = {
        kind: s.idle ? "idle" : "fx",
        cls: l.reduced ? "" : s.cls,
        mood: s.mood,
        pose: s.pose,
        hearts: s.hearts,
        cookie: s.cookie,
      };
      if (actTimer.current != null) {
        window.clearTimeout(actTimer.current);
        timers.current.delete(actTimer.current);
      }
      actRef.current = a;
      setAct(a);
      actTimer.current = later(() => {
        actTimer.current = null;
        actRef.current = NONE;
        setAct(NONE);
      }, s.ms);
    },
    [later],
  );

  // registry + event listener + schedulers
  useEffect(() => {
    const entry: Entry = { ref: latest, play, isFx: () => actRef.current.kind === "fx" };
    reg.set(role, entry);

    const onEvent = (ev: Event) => {
      const d = (ev as CustomEvent<DuoPetEventDetail>).detail;
      if (!d || (d.from !== "me" && d.from !== "partner")) return;
      if (role === "partner" && !active("partner")) return;
      const l = latest.current;
      if (d.type === "hug") {
        const peer = active(other(d.from));
        const mover = role === d.from;
        const canRun = mover && !!peer && !l.asleep && !peer.ref.current.asleep;
        play({ cls: canRun ? "pet-b-run" : "", mood: "love", hearts: true, ms: canRun ? 2800 : 2200 });
      } else if (d.type === "miss") {
        if (role === d.from) play({ cls: l.asleep ? "" : "pet-b-hop", hearts: true, ms: 2400 });
      } else if (d.type === "treat") {
        const target = d.target ?? other(d.from);
        if (role === target) play({ cls: "pet-b-chomp", mood: "excited", pose: "stand", cookie: true, ms: 1800 });
      }
    };
    window.addEventListener("duo-pet", onEvent);

    // idle life: every 20–40 s
    let idleT: number | null = null;
    const idleLoop = () => {
      idleT = window.setTimeout(() => {
        const l = latest.current;
        if (!document.hidden && !l.reduced && !l.asleep && !l.busy && !(role === "partner" && !active("partner")) && actRef.current.kind === "none") {
          play({ ...pick(IDLES), idle: true });
        }
        idleLoop();
      }, rnd(20_000, 40_000));
    };
    idleLoop();

    // two pets together: every 30–60 s (scheduled by "me" only)
    let duoT: number | null = null;
    const duoLoop = () => {
      duoT = window.setTimeout(() => {
        const me = reg.get("me");
        const pa = active("partner");
        if (!document.hidden && !latest.current.reduced && free(me) && free(pa) && me.ref.current.userId !== pa.ref.current.userId) {
          const k = pick(["face", "bounce", "meet"] as const);
          if (k === "face") {
            me.play({ cls: "pet-b-face", ms: 2600 });
            pa.play({ cls: "pet-b-face", ms: 2600 });
          } else if (k === "bounce") {
            me.play({ cls: "pet-b-hop2", ms: 1300 });
            pa.play({ cls: "pet-b-hop2", ms: 1300 });
          } else {
            me.play({ cls: "pet-b-meet", mood: "love", hearts: true, ms: 3200 });
            pa.play({ cls: "pet-b-meet", mood: "love", hearts: true, ms: 3200 });
          }
        }
        duoLoop();
      }, rnd(30_000, 60_000));
    };
    if (role === "me") duoLoop();

    const ts = timers.current;
    return () => {
      window.removeEventListener("duo-pet", onEvent);
      if (idleT != null) window.clearTimeout(idleT);
      if (duoT != null) window.clearTimeout(duoT);
      ts.forEach((t) => window.clearTimeout(t));
      ts.clear();
      actTimer.current = null;
      if (reg.get(role) === entry) reg.delete(role);
    };
  }, [role, play]);

  const onTap = useCallback(() => {
    if (latest.current.asleep) play({ cls: "", mood: "sleepy", pose: "stand", ms: 2000 });
    else play({ cls: "pet-b-jump", mood: "excited", ms: 1500 });
  }, [play]);

  const onLongPress = useCallback(() => {
    play({ cls: "", mood: "love", hearts: true, ms: 2000 });
  }, [play]);

  const base = asleep ? "pet-b-breathe" : blinkCls;
  const className = `pet-b pet-b-${role} ${base} ${act.cls}`.trim();

  return useMemo<PetBehavior>(
    () => ({
      className,
      mood: act.mood,
      pose: act.pose,
      onTap,
      onLongPress,
      overlay: act.hearts || act.cookie ? <>{act.hearts && <Hearts />}{act.cookie && <Cookie />}</> : undefined,
    }),
    [className, act.mood, act.pose, act.hearts, act.cookie, onTap, onLongPress],
  );
}
