CREATE TABLE gym_memberships (user_id text PRIMARY KEY NOT NULL,id text NOT NULL,kind text NOT NULL,months integer,start_date text NOT NULL,end_date text,total_visits integer,remaining_visits integer,paused_at text,revision integer NOT NULL DEFAULT 0,write_token text NOT NULL,updated_at text NOT NULL);
--> statement-breakpoint
CREATE TABLE gym_membership_events (id text PRIMARY KEY NOT NULL,user_id text NOT NULL,action text NOT NULL,body text NOT NULL,created_at text NOT NULL);
--> statement-breakpoint
CREATE TABLE gym_member_notes (user_id text PRIMARY KEY NOT NULL,note text NOT NULL,updated_at text NOT NULL);
--> statement-breakpoint
ALTER TABLE gym_attendance ADD COLUMN pass_debited integer NOT NULL DEFAULT -1;
--> statement-breakpoint
ALTER TABLE gym_attendance ADD COLUMN membership_id text;
--> statement-breakpoint
CREATE TABLE gym_tv_sessions (hash text PRIMARY KEY NOT NULL,expires integer NOT NULL);
--> statement-breakpoint
CREATE TABLE gym_tv_attempts (id text PRIMARY KEY NOT NULL,count integer NOT NULL,window_start integer NOT NULL);
