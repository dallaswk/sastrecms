ALTER TABLE `tenants` ADD `billing_status` text;--> statement-breakpoint
ALTER TABLE `tenants` ADD `billing_ref` text;--> statement-breakpoint
ALTER TABLE `tenants` ADD `trial_ends_at` integer;--> statement-breakpoint
ALTER TABLE `tenants` ADD `grace_until` integer;