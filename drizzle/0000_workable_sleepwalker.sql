CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`business_type` text DEFAULT 'restaurant' NOT NULL,
	`plan` text DEFAULT 'base' NOT NULL,
	`n8n_webhook_url` text,
	`integration_key_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_tags` (
	`business_id` text NOT NULL,
	`phone_number` text NOT NULL,
	`tag` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`business_id`, `phone_number`, `tag`)
);
--> statement-breakpoint
CREATE INDEX `chat_tags_business_phone_idx` ON `chat_tags` (`business_id`,`phone_number`);--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`phone_number` text NOT NULL,
	`user_name` text NOT NULL,
	`agent_active` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chats_business_phone_uq` ON `chats` (`business_id`,`phone_number`);--> statement-breakpoint
CREATE INDEX `chats_business_updated_idx` ON `chats` (`business_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`phone_number` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`notes` text,
	`agent_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_business_phone_uq` ON `contacts` (`business_id`,`phone_number`);--> statement-breakpoint
CREATE INDEX `contacts_business_created_idx` ON `contacts` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`business_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text,
	`role` text DEFAULT 'staff' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`business_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`phone_number` text NOT NULL,
	`message` text NOT NULL,
	`sender` text NOT NULL,
	`type` text DEFAULT 'text' NOT NULL,
	`status` text,
	`storage_path` text,
	`content_type` text,
	`media_deleted` integer DEFAULT false NOT NULL,
	`media_deleted_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_business_phone_idx` ON `messages` (`business_id`,`phone_number`);--> statement-breakpoint
CREATE INDEX `messages_business_created_idx` ON `messages` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pipeline_columns` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pipeline_columns_business_position_idx` ON `pipeline_columns` (`business_id`,`position`);--> statement-breakpoint
CREATE TABLE `pipeline_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`column_id` text NOT NULL,
	`contact_id` text,
	`client_name` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'ARS' NOT NULL,
	`email` text,
	`phone` text,
	`notes` text,
	`priority` text DEFAULT 'media' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pipeline_leads_business_column_idx` ON `pipeline_leads` (`business_id`,`column_id`);--> statement-breakpoint
CREATE INDEX `pipeline_leads_business_created_idx` ON `pipeline_leads` (`business_id`,`created_at`);