"use client";

import { Cookie, Heart, HeartHandshake } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { RoomState } from "@/lib/core/pet";
import { feedTreatAction, hugAction, missAction, type RoomActionResult } from "@/app/(app)/room/actions";
import { cn } from "@/lib/utils";

type Kind = "hug" | "miss" | "treat";
type Target = "me" | "partner";

const btn =
  "relative flex min-h-14 flex-1 touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl border bg-card px-2 py-2 text-sm font-medium shadow-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card";

export function ActionsBar({ state, onChange }: { state: RoomState; onChange: Dispatch<SetStateAction<RoomState>> }) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);

  const { partner, me } = state;
  const treats = me.treats;
  const noPartner = !partner;
  const partnerName = partner?.name || "อีกฝ่าย";

  const toast = (text: string, error: boolean) => {
    setMsg({ text, error });
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 4000);
  };

  const run = async (kind: Kind, target: Target, call: () => Promise<RoomActionResult>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setChoosing(false);
    try {
      const r = await call();
      if (r.state) onChange(r.state);
      if (r.ok) {
        window.dispatchEvent(new CustomEvent("duo-pet", { detail: { type: kind, from: "me", target } }));
      } else if (r.retryAfter != null) {
        toast(`รออีก ${Math.max(1, Math.ceil(r.retryAfter))} วินาทีนะ`, false);
      } else {
        toast("ทำไม่สำเร็จ ลองใหม่อีกครั้ง", true);
      }
    } catch {
      toast("ทำไม่สำเร็จ ลองใหม่อีกครั้ง", true);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const feed = (t: Target) => run("treat", t, () => feedTreatAction(t));
  const onFeedClick = () => {
    if (partner) setChoosing((v) => !v);
    else void feed("me");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button type="button" className={btn} disabled={pending || noPartner} onClick={() => run("hug", "partner", hugAction)}>
          <HeartHandshake className="size-5" aria-hidden />
          กอด
        </button>
        <button type="button" className={btn} disabled={pending || noPartner} onClick={() => run("miss", "partner", missAction)}>
          <Heart className="size-5" aria-hidden />
          คิดถึง
        </button>
        <button
          type="button"
          className={btn}
          disabled={pending || treats <= 0}
          aria-expanded={partner ? choosing : undefined}
          onClick={onFeedClick}
        >
          <Cookie className="size-5" aria-hidden />
          ป้อนขนม
          <span className="absolute -top-2 -right-1 min-w-6 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-semibold text-primary-foreground shadow">
            <span aria-hidden>🍪 {treats}</span>
            <span className="sr-only">ขนม {treats} ชิ้น</span>
          </span>
        </button>
      </div>

      {choosing && partner && (
        <div role="group" aria-label="เลือกน้องที่จะป้อน" className="flex gap-2">
          <button type="button" className={cn(btn, "min-h-11 flex-row")} disabled={pending} onClick={() => feed("partner")}>
            ป้อนน้องของ {partnerName}
          </button>
          <button type="button" className={cn(btn, "min-h-11 flex-row")} disabled={pending} onClick={() => feed("me")}>
            ป้อนน้องของฉัน
          </button>
        </div>
      )}

      {(noPartner || treats <= 0) && (
        <p className="text-center text-xs text-muted-foreground">
          {noPartner ? "ยังไม่มีคู่" : null}
          {noPartner && treats <= 0 ? " · " : null}
          {treats <= 0 ? "ทำรายการให้เสร็จเพื่อรับขนม (วันละ 5 ชิ้น)" : null}
        </p>
      )}

      <p role="status" aria-live="polite" className={cn("min-h-4 text-center text-xs", msg?.error ? "text-destructive" : "text-muted-foreground")}>
        {msg?.text ?? ""}
      </p>
    </div>
  );
}
