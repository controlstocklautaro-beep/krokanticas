CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_business_name_uq` ON `tags` (`business_id`,`name`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`type` text NOT NULL,
	`concept` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`category` text NOT NULL,
	`transaction_date` integer NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transactions_business_date_idx` ON `transactions` (`business_id`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `transactions_business_type_idx` ON `transactions` (`business_id`,`type`);