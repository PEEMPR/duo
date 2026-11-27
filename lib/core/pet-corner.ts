/**
 * น้องตัวเล็กมุมจอ — จุดแดงเมื่อ "อีกฝ่ายมีเรื่องใหม่ให้เราวันนี้"
 * query เดียว: activity_feed_couple_day_idx (couple_id, day) + pet_seen PK + checkins unique(user_id, date)
 * seen-key ตรงกับ getRoomState: เช็กอินที่ผู้ดูยังไม่เช็กอิน = `${id}:t`, นอกนั้น = id ตรงๆ
 * กรองเป้าหมายสดเหมือน getRoomState (ลบ/ไม่ได้ฝากเรา/milestone ไม่เสร็จ/โน้ตส่วนตัว/เช็กอินถูกลบ → ไม่นับ) ด้วย PK lookup ใน EXISTS เดียว
 */
import { sql } from "drizzle-orm";
import type { DB } from "../db";
import { ACTIVITY_KINDS } from "./pet";
import { DEFAULT_TZ, todayIn } from "../time";
import type { Actor } from "./index";

export async function hasNewForViewer(db: DB, actor: Actor): Promise<boolean> {
  const today = todayIn(actor.tz || DEFAULT_TZ);
  const kinds = sql.join(ACTIVITY_KINDS.map((k) => sql`${k}`), sql`, `);
  const rows = await db.all<{ v: number }>(sql`select exists(
        select 1 from activity_feed f
        where f.couple_id = ${actor.coupleId} and f.day = ${today} and f.user_id <> ${actor.userId}
          and f.kind in (${kinds})
          and case f.kind
            when 'checkin' then exists (select 1 from checkins pc where pc.user_id = f.user_id and pc.date = ${today})
            when 'event' then exists (select 1 from events e where e.id = f.ref_id and e.couple_id = f.couple_id)
            when 'assign' then exists (select 1 from list_items li where li.id = f.ref_id and li.couple_id = f.couple_id and li.assignee_id = ${actor.userId})
            when 'milestone' then exists (select 1 from milestones m where m.id = f.ref_id and m.couple_id = f.couple_id and m.done)
            when 'note' then exists (select 1 from notes n where n.id = f.ref_id and n.couple_id = f.couple_id and n.visibility = 'shared')
            else 1 end
          and not exists (
            select 1 from pet_seen s
            where s.user_id = ${actor.userId}
              and s.item_id = case when f.kind = 'checkin'
                and not exists (select 1 from checkins c where c.user_id = ${actor.userId} and c.date = ${today})
                then f.id || ':t' else f.id end
          )
      ) as v`);
  return !!rows[0]?.v;
}
