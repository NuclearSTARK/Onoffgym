CREATE TABLE `gym_notices` (`id` text PRIMARY KEY NOT NULL, `title` text NOT NULL, `body` text NOT NULL, `pinned` integer DEFAULT 0 NOT NULL, `author_id` text NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `gym_settings` (`key` text PRIMARY KEY NOT NULL, `value` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `gym_holiday_cache` (`key` text PRIMARY KEY NOT NULL, `body` text NOT NULL, `updated_at` text NOT NULL);
