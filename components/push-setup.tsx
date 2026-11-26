"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "@/app/actions";

type State = "loading" | "no-key" | "ios-install" | "unsupported" | "denied" | "off" | "on";

function urlB64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushSetup({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!vapidPublicKey) return setState("no-key");
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(isIOS && !standalone ? "ios-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidPublicKey]);

  const enable = () =>
    start(async () => {
      setMsg(null);
      try {
        const permission = await Notification.requestPermission(); // ต้องเรียกจากการกดปุ่มเท่านั้น
        if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(vapidPublicKey!) }));
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const r = await savePushSubscriptionAction(json, navigator.userAgent);
        if ("error" in r && r.error) return setMsg(r.error);
        setState("on");
        setMsg("เปิดแล้ว ลองกด “ส่งทดสอบ” ได้เลย");
      } catch (e) {
        setMsg(`เปิดไม่สำเร็จ: ${(e as Error).message}`);
      }
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("ปิดการแจ้งเตือนบนเครื่องนี้แล้ว");
    });

  const test = () =>
    start(async () => {
      const r = await sendTestPushAction();
      setMsg("error" in r && r.error ? r.error : "ส่งแล้ว รอสักครู่นะ 🔔");
    });

  const box = (text: string) => <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{text}</p>;

  return (
    <div className="flex flex-col gap-3">
      {state === "loading" && box("กำลังตรวจสอบเครื่องนี้…")}
      {state === "no-key" && box("ระบบยังไม่ได้ตั้งค่าคีย์ VAPID (ผู้ดูแลต้องตั้งค่าตาม README ก่อน)")}
      {state === "ios-install" && box("บน iPhone ต้องติดตั้งแอปลงหน้าจอโฮมก่อน: เปิดใน Safari → ปุ่มแชร์ → “เพิ่มไปยังหน้าจอโฮม” แล้วเปิด Duo จากไอคอน (iOS 16.4 ขึ้นไป)")}
      {state === "unsupported" && box("เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน ลองใช้ Chrome, Edge หรือ Safari เวอร์ชันล่าสุด")}
      {state === "denied" && box("การแจ้งเตือนถูกปิดไว้ในตั้งค่าของเครื่อง/เบราว์เซอร์ เปิดอนุญาตให้ Duo ก่อน แล้วกลับมาที่หน้านี้")}
      {state === "off" && (
        <Button onClick={enable} disabled={pending} className="w-fit">
          {pending ? <Loader2 className="animate-spin" /> : <BellRing />} เปิดการแจ้งเตือนบนเครื่องนี้
        </Button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600"><BellRing className="size-4" /> เปิดอยู่บนเครื่องนี้</span>
          <Button variant="secondary" size="sm" onClick={test} disabled={pending}><Send /> ส่งทดสอบ</Button>
          <Button variant="ghost" size="sm" onClick={disable} disabled={pending}><BellOff /> ปิดบนเครื่องนี้</Button>
        </div>
      )}
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
