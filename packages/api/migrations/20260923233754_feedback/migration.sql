-- Idempotent: databases migrated before the drizzle-kit v1 layout recorded this as
-- `0001_feedback.sql`, so Alchemy replays it once under its new directory name.
CREATE TABLE IF NOT EXISTS `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`user_id` text NOT NULL,
	`message` text NOT NULL,
	`path` text NOT NULL,
	`posthog_session_id` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_created_at_idx` ON `feedback` ("created_at" desc);