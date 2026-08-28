CREATE TABLE `domains` (
	`host` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`verified_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `domains_tenant_idx` ON `domains` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `operator_tenants` (
	`operator_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`role` text DEFAULT 'manager' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`operator_id`, `tenant_id`),
	FOREIGN KEY (`operator_id`) REFERENCES `operators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `operator_tenants_tenant_idx` ON `operator_tenants` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `operators` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`is_super_admin` integer DEFAULT false NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operators_email_unique` ON `operators` (`email`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'provisioning' NOT NULL,
	`site_id` text NOT NULL,
	`database_url` text,
	`database_auth_token` text,
	`plan` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`suspended_at` integer,
	`suspended_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_unique` ON `tenants` (`slug`);--> statement-breakpoint
CREATE INDEX `tenants_status_idx` ON `tenants` (`status`);