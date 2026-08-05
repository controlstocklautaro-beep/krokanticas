import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const businesses = sqliteTable("businesses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  businessType: text("business_type").notNull().default("restaurant"),
  plan: text("plan").notNull().default("base"),
  n8nWebhookUrl: text("n8n_webhook_url"),
  integrationKeyHash: text("integration_key_hash"),
  createdAt: integer("created_at").notNull(),
});

export const memberships = sqliteTable("memberships", {
  businessId: text("business_id").notNull(),
  userId: text("user_id").notNull(),
  email: text("email"),
  role: text("role").notNull().default("staff"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.businessId, table.userId] }),
  index("memberships_user_idx").on(table.userId),
]);

export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  phoneNumber: text("phone_number").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  notes: text("notes"),
  agentActive: integer("agent_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("contacts_business_phone_uq").on(table.businessId, table.phoneNumber),
  index("contacts_business_created_idx").on(table.businessId, table.createdAt),
]);

export const chats = sqliteTable("chats", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  phoneNumber: text("phone_number").notNull(),
  userName: text("user_name").notNull(),
  agentActive: integer("agent_active", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("chats_business_phone_uq").on(table.businessId, table.phoneNumber),
  index("chats_business_updated_idx").on(table.businessId, table.updatedAt),
]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  phoneNumber: text("phone_number").notNull(),
  message: text("message").notNull(),
  sender: text("sender").notNull(),
  type: text("type").notNull().default("text"),
  status: text("status"),
  storagePath: text("storage_path"),
  contentType: text("content_type"),
  mediaDeleted: integer("media_deleted", { mode: "boolean" }).notNull().default(false),
  mediaDeletedAt: integer("media_deleted_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("messages_business_phone_idx").on(table.businessId, table.phoneNumber),
  index("messages_business_created_idx").on(table.businessId, table.createdAt),
]);

export const chatTags = sqliteTable("chat_tags", {
  businessId: text("business_id").notNull(),
  phoneNumber: text("phone_number").notNull(),
  tag: text("tag").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.businessId, table.phoneNumber, table.tag] }),
  index("chat_tags_business_phone_idx").on(table.businessId, table.phoneNumber),
]);

export const pipelineColumns = sqliteTable("pipeline_columns", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("pipeline_columns_business_position_idx").on(table.businessId, table.position)]);

export const pipelineLeads = sqliteTable("pipeline_leads", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  columnId: text("column_id").notNull(),
  contactId: text("contact_id"),
  clientName: text("client_name").notNull(),
  subject: text("subject").notNull().default(""),
  amount: real("amount").notNull().default(0),
  currency: text("currency").notNull().default("ARS"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  priority: text("priority").notNull().default("media"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("pipeline_leads_business_column_idx").on(table.businessId, table.columnId),
  index("pipeline_leads_business_created_idx").on(table.businessId, table.createdAt),
]);
