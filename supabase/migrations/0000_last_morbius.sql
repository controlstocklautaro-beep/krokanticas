CREATE TABLE "app_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"active" bigint DEFAULT 1 NOT NULL,
	"must_change_password" bigint DEFAULT 0 NOT NULL,
	"last_login_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_integrations" (
	"business_id" text NOT NULL,
	"provider" text NOT NULL,
	"enabled" bigint DEFAULT 0 NOT NULL,
	"configuration" text DEFAULT '{}' NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "business_integrations_business_id_provider_pk" PRIMARY KEY("business_id","provider")
);
--> statement-breakpoint
CREATE TABLE "business_modules" (
	"business_id" text NOT NULL,
	"module" text NOT NULL,
	"enabled" bigint DEFAULT 1 NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "business_modules_business_id_module_pk" PRIMARY KEY("business_id","module")
);
--> statement-breakpoint
CREATE TABLE "business_settings" (
	"business_id" text PRIMARY KEY NOT NULL,
	"store_open" bigint DEFAULT 1 NOT NULL,
	"delay_minutes" bigint DEFAULT 30 NOT NULL,
	"courier_active" bigint DEFAULT 1 NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"business_type" text DEFAULT 'restaurant' NOT NULL,
	"plan" text DEFAULT 'base' NOT NULL,
	"n8n_webhook_url" text,
	"integration_key_hash" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_tags" (
	"business_id" text NOT NULL,
	"phone_number" text NOT NULL,
	"tag" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "chat_tags_business_id_phone_number_tag_pk" PRIMARY KEY("business_id","phone_number","tag")
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"phone_number" text NOT NULL,
	"user_name" text NOT NULL,
	"agent_active" bigint DEFAULT 1 NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"phone_number" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"address" text,
	"notes" text,
	"agent_active" bigint DEFAULT 1 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"contact_id" text,
	"order_id" text,
	"phone_number" text,
	"customer_name" text NOT NULL,
	"reason" text NOT NULL,
	"summary" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"resolved_at" bigint
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"business_id" text NOT NULL,
	"user_id" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'staff' NOT NULL,
	"active" bigint DEFAULT 1 NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "memberships_business_id_user_id_pk" PRIMARY KEY("business_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"phone_number" text NOT NULL,
	"message" text NOT NULL,
	"sender" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"status" text,
	"storage_path" text,
	"content_type" text,
	"media_deleted" bigint DEFAULT 0 NOT NULL,
	"media_deleted_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text,
	"product_name" text NOT NULL,
	"quantity" bigint NOT NULL,
	"unit_price" double precision NOT NULL,
	"subtotal" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"order_number" bigint NOT NULL,
	"customer_name" text NOT NULL,
	"phone_number" text NOT NULL,
	"delivery_type" text NOT NULL,
	"address" text,
	"zone" text,
	"payment_method" text NOT NULL,
	"scheduled_time" text NOT NULL,
	"subtotal" double precision NOT NULL,
	"shipping_cost" double precision DEFAULT 0 NOT NULL,
	"total" double precision NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"used_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_columns" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"column_id" text NOT NULL,
	"contact_id" text,
	"client_name" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"priority" text DEFAULT 'media' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"price" double precision NOT NULL,
	"aliases" text DEFAULT '[]' NOT NULL,
	"active" bigint DEFAULT 1 NOT NULL,
	"stock_status" text DEFAULT 'available' NOT NULL,
	"stock_quantity" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"type" text NOT NULL,
	"concept" text NOT NULL,
	"amount" double precision NOT NULL,
	"currency" text NOT NULL,
	"category" text NOT NULL,
	"transaction_date" bigint NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "app_sessions_token_uq" ON "app_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "app_sessions_user_idx" ON "app_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "app_sessions_expiry_idx" ON "app_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_email_uq" ON "app_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "business_integrations_business_idx" ON "business_integrations" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "business_modules_business_idx" ON "business_modules" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "chat_tags_business_phone_idx" ON "chat_tags" USING btree ("business_id","phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX "chats_business_phone_uq" ON "chats" USING btree ("business_id","phone_number");--> statement-breakpoint
CREATE INDEX "chats_business_updated_idx" ON "chats" USING btree ("business_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_business_phone_uq" ON "contacts" USING btree ("business_id","phone_number");--> statement-breakpoint
CREATE INDEX "contacts_business_created_idx" ON "contacts" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "handoffs_business_status_idx" ON "handoffs" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "handoffs_business_created_idx" ON "handoffs" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "handoffs_business_contact_idx" ON "handoffs" USING btree ("business_id","contact_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_business_phone_idx" ON "messages" USING btree ("business_id","phone_number");--> statement-breakpoint
CREATE INDEX "messages_business_created_idx" ON "messages" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_business_order_idx" ON "order_items" USING btree ("business_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_business_number_uq" ON "orders" USING btree ("business_id","order_number");--> statement-breakpoint
CREATE INDEX "orders_business_status_idx" ON "orders" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "orders_business_contact_idx" ON "orders" USING btree ("business_id","contact_id");--> statement-breakpoint
CREATE INDEX "orders_business_created_idx" ON "orders" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_hash_uq" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expiry_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "pipeline_columns_business_position_idx" ON "pipeline_columns" USING btree ("business_id","position");--> statement-breakpoint
CREATE INDEX "pipeline_leads_business_column_idx" ON "pipeline_leads" USING btree ("business_id","column_id");--> statement-breakpoint
CREATE INDEX "pipeline_leads_business_created_idx" ON "pipeline_leads" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_business_name_uq" ON "products" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "products_business_status_idx" ON "products" USING btree ("business_id","stock_status");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_business_name_uq" ON "tags" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "transactions_business_date_idx" ON "transactions" USING btree ("business_id","transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_business_type_idx" ON "transactions" USING btree ("business_id","type");