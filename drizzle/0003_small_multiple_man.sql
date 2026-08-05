CREATE TABLE `handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`contact_id` text,
	`order_id` text,
	`phone_number` text,
	`customer_name` text NOT NULL,
	`reason` text NOT NULL,
	`summary` text NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_to` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `handoffs_business_status_idx` ON `handoffs` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `handoffs_business_created_idx` ON `handoffs` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `handoffs_business_contact_idx` ON `handoffs` (`business_id`,`contact_id`);