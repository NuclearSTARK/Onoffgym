CREATE TABLE `gym_members` (`id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `role` text DEFAULT 'member' NOT NULL, `status` text DEFAULT 'pending' NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `gym_workouts` (`key` text PRIMARY KEY NOT NULL, `date` text NOT NULL, `program` text NOT NULL, `body` text NOT NULL, `release_at` integer NOT NULL, `updated_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `gym_workouts_release_idx` ON `gym_workouts` (`release_at`);
--> statement-breakpoint
CREATE TABLE `gym_movements` (`name` text PRIMARY KEY NOT NULL, `body` text NOT NULL);
