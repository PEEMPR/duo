import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  character: text("character"), // ตัวละครที่เลือก (ดู lib/characters.ts)
  notifyPrefs: text("notify_prefs").notNull().default("{}"), // JSON: เปิด/ปิดแจ้งเตือนแต่ละประเภท
  checkinReminderTime: text("checkin_reminder_time").notNull().default("21:00"),
  birthday: text("birthday"), // YYYY-MM-DD (เก็บปีด้วย ไม่โชว์อายุ) · null = ไม่ได้ใส่
  showBirthday: integer("show_birthday", { mode: "boolean" }).notNull().default(true),
  // ห้องของน้อง: ขนมที่สะสม (สูงสุด 20) · ได้จากการทำรายการเสร็จ วันละไม่เกิน 5 (treats_day = วันท้องถิ่นที่นับ treats_today)
  treats: integer("treats").notNull().default(0),
  treatsDay: text("treats_day"),
  treatsToday: integer("treats_today").notNull().default(0),
  petRest: integer("pet_rest", { mode: "boolean" }).notNull().default(false), // โหมดพัก: น้องไม่เศร้า/ไม่ขดตัวถ้าไม่ได้เช็กอินนาน
  createdAt: text("created_at").notNull().default(now),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha-256 ของ token (ไม่เก็บ token จริง)
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const couples = sqliteTable("couples", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  anniversary: text("anniversary"), // YYYY-MM-DD
  inviteCode: text("invite_code").notNull().unique(),
  theme: text("theme").notNull().default("rose"), // ธีมสีที่คู่นี้เลือก (ดู lib/themes.ts)
  room: text("room"), // ห้องของน้อง (ดู lib/core/pet.ts ROOM_IDS) · null = ตามธีม
  createdAt: text("created_at").notNull().default(now),
});

export const coupleMembers = sqliteTable(
  "couple_members",
  {
    coupleId: text("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: text("joined_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.coupleId, t.userId] }), uniqueIndex("couple_members_user_uq").on(t.userId)],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    coupleId: text("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startAt: text("start_at").notNull(), // ISO 8601 (UTC)
    endAt: text("end_at"),
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    remindBefore: text("remind_before").notNull().default("d1"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("events_couple_start_idx").on(t.coupleId, t.startAt)],
);

export const lists = sqliteTable(
  "lists",
  {
    id: text("id").primaryKey(),
    coupleId: text("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["todo", "shopping", "wishlist", "places", "other"] }).notNull().default("todo"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("lists_couple_idx").on(t.coupleId)],
);

export const listItems = sqliteTable(
  "list_items",
  {
    id: text("id").primaryKey(),
    listId: text("list_id").notNull().references(() => lists.id, { onDelete: "cascade" }),
    coupleId: text("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: text("due_date"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: text("created_at").notNull().default(now),
    doneAt: text("done_at"),
  },
  (t) => [index("list_items_list_idx").on(t.listId), index("list_items_couple_idx").on(t.coupleId, t.done)],
);

export const checkins = sqliteTable(
  "checkins",
  {
    id: text("id").primaryKey(),
    coupleId: text("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD ตาม APP_TIMEZONE
    mood: integer("mood").notNull(), // 1-5
    energy: integer("energy").notNull(), // 1-5
    gratitude: text("gratitude"),
    need: text("need"),
    note: text("note"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("checkins_user_date_uq").on(t.userId, t.date), index("checkins_couple_date_idx").on(t.coupleId, t.date)],
);

export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    coupleId: text("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    targetDate: text("target_date"),
    status: text("status", { enum: ["idea", "planning", "doing", "done"] }).notNull().default("idea"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("plans_couple_idx").on(t.coupleId)],
);

export const milestones = sqliteTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
    coupleId: text("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    dueDate: text("due_date"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("milestones_plan_idx").on(t.planId)],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    coupleId: text("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    visibility: text("visibility", { enum: ["shared", "private"] }).notNull().default("shared"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("notes_couple_idx").on(t.coupleId, t.updatedAt)],
);

/** อุปกรณ์ที่สมัครรับ Web Push (1 คนมีได้หลายเครื่อง) */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull().default(now),
    lastSuccessAt: text("last_success_at"),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/** คิวแจ้งเตือนที่รอส่ง (cron มาหยิบไปส่งทุกนาที, รวบหลายเรื่องเป็นข้อความเดียว) */
export const notificationOutbox = sqliteTable(
  "notification_outbox",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    short: text("short"), // ข้อความสั้นสำหรับตอนรวบหลายเรื่อง
    url: text("url").notNull().default("/dashboard"),
    icon: text("icon"),
    groupable: integer("groupable", { mode: "boolean" }).notNull().default(false),
    deliverAfter: text("deliver_after").notNull(),
    sentAt: text("sent_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("notification_outbox_due_idx").on(t.sentAt, t.deliverAfter)],
);

/** กันแจ้งเตือนตามเวลาซ้ำ (เช่น เตือนเช็กอินวันละครั้ง) */
export const notificationLog = sqliteTable(
  "notification_log",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    ref: text("ref").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.ref] })],
);

/**
 * กิจกรรมที่น้องของอีกฝ่ายจะเล่าให้ฟังในห้อง (ดู lib/core/pet.ts)
 * text = ข้อความที่ server สร้าง (ไม่มีข้อมูลส่วนตัว) · เช็กอินไม่เก็บ text — สร้างตอนอ่านเพื่อบังคับกฎซ่อนเช็กอิน
 */
export const activityFeed = sqliteTable(
  "activity_feed",
  {
    id: text("id").primaryKey(),
    coupleId: text("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    refId: text("ref_id"),
    text: text("text"),
    meta: text("meta"), // JSON เล็กๆ เช่น { target: "me" | "partner" } ของขนม, { listId } ของงานที่ฝาก
    day: text("day").notNull(), // YYYY-MM-DD ตามเขตเวลาของผู้ทำ
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("activity_feed_couple_day_idx").on(t.coupleId, t.day)],
);

/** ผู้ใช้เห็นข้อความไหนไปแล้ว (item_id = id ของ activity_feed หรือ "memory:<วัน>") */
export const petSeen = sqliteTable(
  "pet_seen",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    seenAt: text("seen_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);
