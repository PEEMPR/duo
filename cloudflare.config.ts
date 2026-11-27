import { bindings, defineConfig, defineWorker, exports as workerExports, triggers } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "couple-app",
    // worker.ts ห่อ vinext + OAuth provider + MCP endpoint ไว้ใน Worker เดียว
    entrypoint: "./worker.ts",
    compatibilityDate: "2026-11-25",
    // global_fetch_strictly_public จำเป็นเมื่อเปิด Client ID Metadata Documents (CIMD)
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
      DB: bindings.d1({ name: "couple-app-db" }),
      OAUTH_KV: bindings.kv(),
      // เขตเวลาที่ใช้ตัดวัน (เช็กอินรายวัน, "วันนี้")
      APP_TIMEZONE: bindings.text("Asia/Bangkok"),
      // ผู้ติดต่อของ VAPID (Web Push) ส่วนคีย์ VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ตั้งเป็น secret (ดู README)
      VAPID_SUBJECT: bindings.text("https://couple-app.peem.workers.dev"),
      // ห้อง realtime ของแต่ละคู่ (Durable Object, WebSocket Hibernation) — ดู lib/realtime/room-do.ts
      ROOM: bindings.durableObject({ worker: "couple-app", exportName: "CoupleRoom" }),
    },
    // Durable Object classes ที่ export จาก worker.ts (SQLite storage = ใช้ได้บน Free plan)
    exports: {
      CoupleRoom: workerExports.durableObject({ storage: "sqlite" }),
    },
    // cron ทุกนาที: สร้างแจ้งเตือนตามเวลา + ส่งแจ้งเตือนที่รอในคิว
    triggers: [triggers.scheduled({ schedule: "* * * * *" })],
  }),
});
