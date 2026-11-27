CREATE TABLE `activity_feed` (
	`id` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text,
	`text` text,
	`meta` text,
	`day` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_feed_couple_day_idx` ON `activity_feed` (`couple_id`,`day`);--> statement-breakpoint
CREATE TABLE `pet_seen` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `couples` ADD `room` text;--> statement-breakpoint
ALTER TABLE `users` ADD `treats` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `treats_day` text;--> statement-breakpoint
ALTER TABLE `users` ADD `treats_today` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `pet_rest` integer DEFAULT false NOT NULL;