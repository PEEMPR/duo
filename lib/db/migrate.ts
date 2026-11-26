/**
 * Auto-migration: รัน migration ที่ยังไม่ได้ apply ตอน request แรกของแต่ละ isolate
 * ใช้ตาราง d1_migrations รูปแบบเดียวกับ `wrangler/cf d1 migrations apply` จึงใช้ CLI ควบคู่ได้
 * เพิ่ม migration ใหม่: `npx drizzle-kit generate` แล้วระบบจะหยิบไฟล์ใน /migrations ไปเองตอน build
 */
const files = import.meta.glob("../../migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const MIGRATIONS = Object.entries(files)
  .map(([path, sql]) => ({ name: path.split("/").pop()!, sql }))
  .sort((a, b) => a.name.localeCompare(b.name));

let ready: Promise<void> | null = null;

export function ensureMigrated(d1: D1Database): Promise<void> {
  ready ??= run(d1).catch((e) => {
    ready = null; // ลองใหม่ใน request ถัดไป
    throw e;
  });
  return ready;
}

async function run(d1: D1Database) {
  await d1
    .prepare("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)")
    .run();
  const { results } = await d1.prepare("SELECT name FROM d1_migrations").all<{ name: string }>();
  const applied = new Set(results.map((r) => r.name));
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    const statements = m.sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => d1.prepare(s));
    try {
      // batch = transaction เดียว: สำเร็จทั้งหมดหรือไม่มีอะไรเปลี่ยน
      await d1.batch([...statements, d1.prepare("INSERT INTO d1_migrations (name) VALUES (?)").bind(m.name)]);
    } catch (e) {
      // อีก isolate อาจ apply ไปพร้อมกันแล้ว
      const again = await d1.prepare("SELECT 1 FROM d1_migrations WHERE name = ?").bind(m.name).first();
      if (!again) throw e;
    }
  }
}
