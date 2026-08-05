CREATE TABLE `business_settings` (
	`business_id` text PRIMARY KEY NOT NULL,
	`store_open` integer DEFAULT true NOT NULL,
	`delay_minutes` integer DEFAULT 30 NOT NULL,
	`courier_active` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text,
	`product_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` real NOT NULL,
	`subtotal` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_items_business_order_idx` ON `order_items` (`business_id`,`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`order_number` integer NOT NULL,
	`customer_name` text NOT NULL,
	`phone_number` text NOT NULL,
	`delivery_type` text NOT NULL,
	`address` text,
	`zone` text,
	`payment_method` text NOT NULL,
	`scheduled_time` text NOT NULL,
	`subtotal` real NOT NULL,
	`shipping_cost` real DEFAULT 0 NOT NULL,
	`total` real NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_business_number_uq` ON `orders` (`business_id`,`order_number`);--> statement-breakpoint
CREATE INDEX `orders_business_status_idx` ON `orders` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `orders_business_contact_idx` ON `orders` (`business_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `orders_business_created_idx` ON `orders` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`price` real NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`stock_status` text DEFAULT 'available' NOT NULL,
	`stock_quantity` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_business_name_uq` ON `products` (`business_id`,`name`);--> statement-breakpoint
CREATE INDEX `products_business_status_idx` ON `products` (`business_id`,`stock_status`);--> statement-breakpoint
ALTER TABLE `contacts` ADD `address` text;