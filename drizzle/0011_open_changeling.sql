ALTER TABLE `sites` ADD `host` text;--> statement-breakpoint
CREATE UNIQUE INDEX `sites_host_unique` ON `sites` (`host`);