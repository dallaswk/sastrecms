CREATE TABLE `node_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`node_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`fields` text DEFAULT '{}' NOT NULL,
	`seo` text DEFAULT '{}',
	`status` text NOT NULL,
	`author_id` text,
	`author_via` text DEFAULT 'web' NOT NULL,
	`summary` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `node_revisions_node_idx` ON `node_revisions` (`node_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `nodes` ADD `publish_at` integer;--> statement-breakpoint
ALTER TABLE `nodes` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `nodes_visibility_idx` ON `nodes` (`site_id`,`status`,`publish_at`);--> statement-breakpoint
CREATE INDEX `nodes_deleted_idx` ON `nodes` (`site_id`,`deleted_at`);