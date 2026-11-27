ALTER TABLE `users` ADD `birthday` text;--> statement-breakpoint
ALTER TABLE `users` ADD `show_birthday` integer DEFAULT true NOT NULL;