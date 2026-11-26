import { bindings, defineConfig, defineWorker } from "cf/config";

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
    },
  }),
});
