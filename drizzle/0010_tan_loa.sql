-- Scoping roles and API tokens to a site.
--
-- The three roles had fixed primary keys — role_admin, role_editor, role_collaborator — which
-- works for exactly one site. A second site's bootstrap collides on the primary key,
-- onConflictDoNothing swallows the conflict, and that site ends up with zero roles: silently,
-- on every request, with nobody able to administer it.
--
-- Order matters here. The unique index on (site_id, key) is created LAST, because while both
-- the legacy row and its replacement exist they share that pair.

-- Every existing token belongs to the only site there has ever been.
ALTER TABLE `api_tokens` ADD `site_id` text NOT NULL DEFAULT 'site_default' REFERENCES sites(id);
--> statement-breakpoint

-- 1. The replacement rows, ids carrying the site.
INSERT INTO `roles` (`id`, `site_id`, `key`, `label`)
  SELECT 'role_' || `key` || '_' || `site_id`, `site_id`, `key`, `label`
  FROM `roles`
  WHERE `id` IN ('role_admin', 'role_editor', 'role_collaborator');
--> statement-breakpoint

-- 2. Repoint what references them, matched by (site, key) rather than by a hardcoded map so
--    this is correct even if a deployment somehow has more than one site already.
UPDATE `user_roles`
  SET `role_id` = (
    SELECT `new`.`id` FROM `roles` `old`
    JOIN `roles` `new` ON `new`.`site_id` = `old`.`site_id`
                      AND `new`.`key` = `old`.`key`
                      AND `new`.`id` <> `old`.`id`
    WHERE `old`.`id` = `user_roles`.`role_id`
  )
  WHERE `role_id` IN ('role_admin', 'role_editor', 'role_collaborator');
--> statement-breakpoint

UPDATE `role_content_permissions`
  SET `role_id` = (
    SELECT `new`.`id` FROM `roles` `old`
    JOIN `roles` `new` ON `new`.`site_id` = `old`.`site_id`
                      AND `new`.`key` = `old`.`key`
                      AND `new`.`id` <> `old`.`id`
    WHERE `old`.`id` = `role_content_permissions`.`role_id`
  )
  WHERE `role_id` IN ('role_admin', 'role_editor', 'role_collaborator');
--> statement-breakpoint

-- 3. Now nothing points at them.
DELETE FROM `roles` WHERE `id` IN ('role_admin', 'role_editor', 'role_collaborator');
--> statement-breakpoint

CREATE UNIQUE INDEX `roles_site_key_idx` ON `roles` (`site_id`,`key`);
