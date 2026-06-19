ALTER TABLE `settings` ADD `logo_url` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `favicon_url` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `redirects` text DEFAULT '[]';