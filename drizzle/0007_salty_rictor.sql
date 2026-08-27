CREATE TABLE `form_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`node_id` text,
	`form_id` text NOT NULL,
	`form_label` text,
	`values` text DEFAULT '{}' NOT NULL,
	`from_name` text,
	`from_email` text,
	`status` text DEFAULT 'new' NOT NULL,
	`ip_hash` text,
	`user_agent` text,
	`consent_text` text,
	`notified_at` integer,
	`notify_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `form_submissions_site_created_idx` ON `form_submissions` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `form_submissions_status_idx` ON `form_submissions` (`site_id`,`status`);--> statement-breakpoint
CREATE INDEX `form_submissions_rate_idx` ON `form_submissions` (`ip_hash`,`created_at`);