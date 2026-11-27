"use client";

/**
 * WebSocket ของห้องคู่ (/api/room/ws) ฝั่ง browser
 *  - ต่อเฉพาะตอน component mount อยู่และแท็บมองเห็นอยู่ (visibilityState = visible) · ซ่อน/unmount → ปิด
 *  - หลุด → ต่อใหม่แบบ exponential backoff (1 s → สูงสุด 30 s, มี jitter)
 *  - ต่อสำเร็จทุกครั้ง (รวมครั้งแรก) → onMessage({ type: "activity" }) ให้หน้า refetch เพราะ poke ระหว่างหลุดจะหายไป
 *  - ส่ง "ping" ทุก 30 s (DO ตอบ "pong" อัตโนมัติ) กัน proxy/NAT ตัดการเชื่อมต่อที่เงียบ
 * server ส่งมาแค่ {"type":"activity"|"room"} — ไม่มีข้อมูลจริง
 */
import { useEffect, useRef, useState } from "react";

type RoomMessage = { type: "activity" | "room" };

const MIN_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const PING_MS = 30_000;
/** ไม่ได้ยินอะไรจาก server (รวม "pong") นานเกินนี้ → ถือว่าหลุด (half-open) ปิดแล้วต่อใหม่ */
const STALE_MS = PING_MS * 2 + 5_000;
/** server เบียดออกเพราะคู่นี้เปิดไว้หลายแท็บเกิน (ข้อความ "evicted" / close 4000)
 *  → ไม่ต่อใหม่เอง (กันแย่งกัน) จนกว่าแท็บจะกลับมาแสดงอีกครั้ง · ต้องตรงกับ lib/realtime/room-do.ts */
const EVICTED_MESSAGE = "evicted";
const CLOSE_TOO_MANY = 4000;
/** server ปิดเพราะไม่มี session (4401) / ยังไม่มีคู่ (4403) → เลิกต่อจนกว่า component จะ mount ใหม่ (โหลดหน้าใหม่) */
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_NO_COUPLE = 4403;
/** ต่อไม่สำเร็จติดกันเท่านี้ครั้ง (ไม่เคย open) → หยุดจนกว่าแท็บจะกลับมาแสดงอีกครั้ง */
const MAX_CONSECUTIVE_FAILURES = 6;

export function useRoomSocket(onMessage: (m: { type: "activity" | "room" }) => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  // เก็บ callback ล่าสุดใน ref: render ใหม่ไม่ทำให้ต่อ socket ใหม่
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let attempt = 0;
    let failures = 0; // ต่อไม่สำเร็จติดกัน (ไม่เคย open)
    let blocked = false; // 4401/4403: ห้ามต่ออีกตลอดอายุ component นี้
    let disposed = false;

    const emit = (m: RoomMessage) => {
      try {
        onMessageRef.current(m);
      } catch (e) {
        console.error("[room] onMessage failed", e);
      }
    };
    const visible = () => document.visibilityState === "visible";
    const stopPing = () => {
      if (pingTimer !== undefined) clearInterval(pingTimer);
      pingTimer = undefined;
    };
    const stopRetry = () => {
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      retryTimer = undefined;
    };

    const scheduleReconnect = () => {
      if (disposed || blocked || retryTimer !== undefined || !visible()) return;
      if (failures >= MAX_CONSECUTIVE_FAILURES) return; // รอ visibilitychange → visible
      const base = Math.min(MAX_DELAY_MS, MIN_DELAY_MS * 2 ** attempt);
      attempt++;
      const delay = Math.min(MAX_DELAY_MS, base * (0.8 + Math.random() * 0.4));
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, delay);
    };

    function connect() {
      if (disposed || blocked || ws || !visible()) return;
      stopRetry();
      const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/room/ws`;
      let sock: WebSocket;
      try {
        sock = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      ws = sock;
      let lastHeard = Date.now();
      let opened = false;
      sock.onopen = () => {
        if (ws !== sock) return;
        opened = true;
        attempt = 0;
        failures = 0;
        lastHeard = Date.now();
        setConnected(true);
        stopPing();
        pingTimer = setInterval(() => {
          if (ws !== sock) return;
          if (Date.now() - lastHeard > STALE_MS) {
            // half-open: ไม่มี pong กลับมา → ทิ้งแล้วต่อใหม่
            drop(sock);
            scheduleReconnect();
            return;
          }
          if (sock.readyState === WebSocket.OPEN) {
            try {
              sock.send("ping");
            } catch {
              /* onclose จะตามมา */
            }
          }
        }, PING_MS);
        emit({ type: "activity" }); // ให้หน้า refetch: poke ระหว่างที่ยังไม่ต่อหายไปแล้ว
      };
      sock.onmessage = (e: MessageEvent) => {
        if (ws !== sock || typeof e.data !== "string") return;
        lastHeard = Date.now();
        if (e.data === "pong") return;
        if (e.data === EVICTED_MESSAGE) {
          drop(sock); // ไม่ต่อใหม่จนกว่าจะ visible อีกครั้ง
          return;
        }
        try {
          const m = JSON.parse(e.data) as { type?: unknown };
          if (m?.type === "activity" || m?.type === "room") emit({ type: m.type });
        } catch {
          /* ไม่ใช่ JSON → ไม่สนใจ */
        }
      };
      sock.onerror = () => {
        /* onclose ตามมาเสมอ */
      };
      sock.onclose = (e: CloseEvent) => {
        if (ws !== sock) return;
        ws = null;
        stopPing();
        setConnected(false);
        if (e.code === CLOSE_UNAUTHORIZED || e.code === CLOSE_NO_COUPLE) {
          blocked = true;
          stopRetry();
          return;
        }
        // ปิดก่อน open สำเร็จ (handshake ล้ม/server ล่ม) = ล้มเหลวติดกันอีกหนึ่งครั้ง
        if (!opened) failures++;
        if (e.code !== CLOSE_TOO_MANY) scheduleReconnect();
      };
    }

    /** ปิด socket ปัจจุบันโดยไม่ trigger onclose/reconnect */
    function drop(sock: WebSocket | null) {
      stopPing();
      if (sock && ws === sock) ws = null;
      if (sock) {
        sock.onopen = sock.onmessage = sock.onerror = sock.onclose = null;
        try {
          sock.close(1000, "bye");
        } catch {
          /* ปิดไปแล้ว */
        }
      }
      setConnected(false);
    }

    const disconnect = () => {
      stopRetry();
      drop(ws);
    };

    const onVisibility = () => {
      if (visible()) {
        attempt = 0;
        failures = 0;
        connect();
      } else {
        disconnect();
      }
    };
    const onOnline = () => {
      if (ws || blocked || !visible()) return;
      stopRetry();
      attempt = 0;
      failures = 0;
      connect();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    connect();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      disconnect();
    };
  }, []);

  return { connected };
}
