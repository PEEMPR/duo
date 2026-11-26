import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
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
