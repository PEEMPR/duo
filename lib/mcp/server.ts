import { McpServer, type ToolAnnotations } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as core from "../core";
import { getDb, type DB } from "../db";
import { coupleMembers } from "../db/schema";
import { addDays, DEFAULT_TZ, todayIn } from "../time";

export type McpProps = { userId: string };

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ content: [{ type: "text" as const, text: `ผิดพลาด: ${(e as Error).message}` }], isError: true });

type LooseRegister = { registerTool: (name: string, config: object, cb: (input: never) => Promise<unknown>) => unknown };

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

async function actorFor(db: DB, userId: string, tz: string): Promise<core.Actor> {
  const m = await db.select().from(coupleMembers).where(eq(coupleMembers.userId, userId)).get();
  if (!m) throw new Error("บัญชีนี้ยังไม่ได้สร้างหรือเข้าร่วมพื้นที่คู่ — เปิดเว็บแล้วทำขั้นตอน onboarding ก่อน");
  return { userId, coupleId: m.coupleId, tz };
}

/**
 * สร้าง MCP server ต่อ request (stateless). ทุก tool เรียก lib/core ซึ่งบังคับกฎสิทธิ์เดียวกับหน้าเว็บ
 */
export function buildMcpServer(env: { DB: D1Database; APP_TIMEZONE?: string }, props: McpProps) {
  const db = getDb(env.DB);
  const tz = env.APP_TIMEZONE || DEFAULT_TZ;
  const server = new McpServer({ name: "duo-couple", version: "1.0.0" });

  const tool = <S extends z.ZodObject>(
    name: string,
    description: string,
    inputSchema: S,
    annotations: ToolAnnotations,
    run: (a: core.Actor, input: z.infer<S>) => Promise<unknown>,
  ) =>
    (server as unknown as LooseRegister).registerTool(name, { description, inputSchema, annotations }, async (input: z.infer<S>) => {
      try {
        return ok(await run(await actorFor(db, props.userId, tz), input));
      } catch (e) {
        return fail(e);
      }
    });

  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");

  tool("get_summary", "สรุปภาพรวมของคู่วันนี้: สถานะเช็กอิน, นัด 7 วันข้างหน้า, งานค้าง, แผนที่กำลังทำ, บันทึกล่าสุด (เวลาเป็นเขต Asia/Bangkok)", z.object({}), READ, (a) =>
    core.getSummary(db, a),
  );

  /* ปฏิทิน */
  tool(
    "list_events",
    "ดูนัดหมายที่คาบเกี่ยวช่วงวันที่ รวมนัดหลายวันที่ยังไม่จบ (ค่าเริ่มต้น: วันนี้ถึงอีก 30 วัน)",
    z.object({ from: date.optional(), to: date.optional() }),
    READ,
    (a, i) => {
      const from = i.from ?? todayIn(tz);
      return core.listEvents(db, a, { from, to: i.to ?? addDays(from, 30) });
    },
  );
  tool("create_event", "เพิ่มนัดหมายในปฏิทินร่วม รองรับนัดหลายวัน (ใส่ endDate) ถ้าไม่ระบุ time และ endTime จะเป็นนัดทั้งวัน", core.EventInput, WRITE, async (a, i) => ({ id: await core.createEvent(db, a, i), created: i.title }));
  tool("delete_event", "ลบนัดหมายด้วย id", z.object({ id: z.string() }), { ...WRITE, destructiveHint: true }, async (a, i) => {
    await core.deleteEvent(db, a, i.id);
    return "ลบแล้ว";
  });

  /* รายการ */
  tool("get_lists", "ดูรายการทั้งหมด (งานบ้าน, ของต้องซื้อ, ที่อยากไป ฯลฯ) พร้อมจำนวนที่ยังค้าง", z.object({}), READ, (a) => core.getLists(db, a));
  tool("get_list", "ดูรายการย่อยในรายการเดียว ระบุด้วย id หรือชื่อรายการ", z.object({ list: z.string().describe("id หรือชื่อรายการ") }), READ, (a, i) =>
    core.getListWithItems(db, a, i.list),
  );
  tool(
    "add_list_item",
    "เพิ่มของลงรายการ (ระบุรายการด้วยชื่อหรือ id) และมอบหมายให้ me/partner ได้",
    z.object({
      list: z.string().describe("ชื่อหรือ id ของรายการ เช่น 'ของที่ต้องซื้อ'"),
      text: z.string().min(1),
      assignee: z.enum(["me", "partner"]).optional(),
      dueDate: date.optional(),
    }),
    WRITE,
    async (a, i) => {
      let assigneeId: string | null = null;
      if (i.assignee) {
        const c = await core.getCouple(db, a);
        assigneeId = i.assignee === "me" ? a.userId : (c.partner?.id ?? null);
      }
      return core.addListItem(db, a, { list: i.list, text: i.text, assigneeId, dueDate: i.dueDate ?? null });
    },
  );
  tool("complete_list_item", "ทำเครื่องหมายว่ารายการย่อยเสร็จ (หรือ done=false เพื่อยกเลิก)", z.object({ id: z.string(), done: z.boolean().default(true) }), WRITE, (a, i) =>
    core.setListItemDone(db, a, i.id, i.done),
  );

  /* เช็กอิน */
  tool(
    "submit_checkin",
    "บันทึกเช็กอินวันนี้ของผู้ใช้ (ถ้าเช็กอินแล้วจะเป็นการแก้ไข)",
    core.CheckinInput,
    WRITE,
    async (a, i) => ({ date: await core.submitCheckin(db, a, i), saved: true }),
  );
  tool(
    "get_checkins",
    "ดูเช็กอินย้อนหลังของทั้งคู่ เช็กอินของอีกฝ่ายในวันที่ผู้ใช้ยังไม่ได้เช็กอินจะถูกซ่อน (partnerHidden=true)",
    z.object({ days: z.number().int().min(1).max(60).default(7) }),
    READ,
    (a, i) => core.getCheckins(db, a, i.days),
  );

  /* แผน */
  tool("list_plans", "ดูแผนร่วมกันทั้งหมดพร้อม milestones", z.object({}), READ, (a) => core.getPlans(db, a));
  tool(
    "create_plan",
    "สร้างแผนร่วม เช่น ทริป หรือเป้าหมายเก็บเงิน พร้อม milestones",
    z.object({ title: z.string().min(1), description: z.string().optional(), targetDate: date.optional(), milestones: z.array(z.string()).optional() }),
    WRITE,
    async (a, i) => ({ id: await core.createPlan(db, a, i) }),
  );
  tool("complete_milestone", "ทำเครื่องหมาย milestone ว่าเสร็จ (done=false เพื่อยกเลิก)", z.object({ id: z.string(), done: z.boolean().default(true) }), WRITE, async (a, i) => {
    await core.setMilestoneDone(db, a, i.id, i.done);
    return "อัปเดตแล้ว";
  });

  /* บันทึก */
  tool(
    "add_note",
    "จดบันทึกใหม่ visibility=shared (แฟนเห็นด้วย, ค่าเริ่มต้น) หรือ private (เห็นคนเดียว)",
    z.object({ title: z.string().min(1), body: z.string().default(""), visibility: z.enum(["shared", "private"]).default("shared") }),
    WRITE,
    async (a, i) => ({ id: await core.saveNote(db, a, i) }),
  );
  tool("search_notes", "ค้นหาบันทึกด้วยคำค้น (ไม่ใส่ = ล่าสุด)", z.object({ query: z.string().optional(), limit: z.number().int().min(1).max(50).default(10) }), READ, async (a, i) =>
    (await core.listNotes(db, a, i)).map((n) => ({ id: n.id, title: n.title, preview: n.body.slice(0, 200), visibility: n.visibility, updatedAt: n.updatedAt })),
  );
  tool("get_note", "อ่านบันทึกฉบับเต็มด้วย id", z.object({ id: z.string() }), READ, (a, i) => core.getNote(db, a, i.id));

  return server;
}
