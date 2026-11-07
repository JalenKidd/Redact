CREATE TABLE `sync_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `sync_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_devices_token_hash_unique` ON `sync_devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sync_devices_space` ON `sync_devices` (`space_id`);--> statement-breakpoint
CREATE TABLE `sync_invitations` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`expires` integer NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `sync_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text,
	`version` integer DEFAULT 0 NOT NULL
);
