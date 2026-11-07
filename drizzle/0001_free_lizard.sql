ALTER TABLE `sync_spaces` ADD `activity_payload` text;--> statement-breakpoint
ALTER TABLE `sync_spaces` ADD `activity_version` integer DEFAULT 0 NOT NULL;