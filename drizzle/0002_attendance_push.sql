CREATE TABLE `gym_attendance` (`user_id` text NOT NULL, `date` text NOT NULL, `created_at` text NOT NULL, PRIMARY KEY (`user_id`,`date`));
--> statement-breakpoint
CREATE TABLE `gym_push_subscriptions` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `body` text NOT NULL, `preferences` text NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `gym_push_events` (`id` text PRIMARY KEY NOT NULL, `kind` text NOT NULL, `payload` text NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `gym_push_deliveries` (`event_id` text NOT NULL, `subscription_id` text NOT NULL, `status` text NOT NULL, `updated_at` text NOT NULL, PRIMARY KEY (`event_id`,`subscription_id`));
