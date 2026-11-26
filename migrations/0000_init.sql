CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`mood` integer NOT NULL,
	`energy` integer NOT NULL,
	`gratitude` text,
	`need` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_user_date_uq` ON `checkins` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `checkins_couple_date_idx` ON `checkins` (`couple_id`,`date`);--> statement-breakpoint
CREATE TABLE `couple_members` (
	`couple_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`couple_id`, `user_id`),
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `couple_members_user_uq` ON `couple_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `couples` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`anniversary` text,
	`invite_code` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `couples_invite_code_unique` ON `couples` (`invite_code`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`location` text,
	`start_at` text NOT NULL,
	`end_at` text,
	`all_day` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_couple_start_idx` ON `events` (`couple_id`,`start_at`);--> statement-breakpoint
CREATE TABLE `list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`couple_id` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`assignee_id` text,
	`due_date` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`done_at` text,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `list_items_list_idx` ON `list_items` (`list_id`);--> statement-breakpoint
CREATE INDEX `list_items_couple_idx` ON `list_items` (`couple_id`,`done`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'todo' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lists_couple_idx` ON `lists` (`couple_id`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`couple_id` text NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`due_date` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `milestones_plan_idx` ON `milestones` (`plan_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notes_couple_idx` ON `notes` (`couple_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`target_date` text,
	`status` text DEFAULT 'idea' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plans_couple_idx` ON `plans` (`couple_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);