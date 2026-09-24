CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`user_id` text NOT NULL,
	`message` text NOT NULL,
	`path` text NOT NULL,
	`posthog_session_id` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE INDEX `feedback_created_at_idx` ON `feedback` ("created_at" desc);