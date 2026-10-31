ALTER TABLE gym_tv_sessions ADD COLUMN device_id text;
--> statement-breakpoint
ALTER TABLE gym_tv_sessions ADD COLUMN last_seen integer;
--> statement-breakpoint
ALTER TABLE gym_tv_sessions ADD COLUMN display_date text;
--> statement-breakpoint
ALTER TABLE gym_tv_sessions ADD COLUMN display_preferences text;
