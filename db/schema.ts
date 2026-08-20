import { bigint, doublePrecision, index, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";

// El modelo conserva milisegundos Unix y flags 0/1 para no alterar los contratos
// existentes de la API durante la migración desde D1 a PostgreSQL.
const sqliteTable = pgTable;
const integer = (name: string, config?: unknown) => {
  void config;
  return bigint(name, { mode: "number" });
};
const real = doublePrecision;

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
  active: integer("active", { mode: "boolean" }).notNull().default(1),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.businessId, table.userId] }),
  index("memberships_user_idx").on(table.userId),
]);

export const businessModules = sqliteTable("business_modules", {
  businessId: text("business_id").notNull(),
  module: text("module").notNull(),
  enabled: integer("enabled").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.businessId, table.module] }),
  index("business_modules_business_idx").on(table.businessId),
]);

export const businessIntegrations = sqliteTable("business_integrations", {
  businessId: text("business_id").notNull(),
  provider: text("provider").notNull(),
  enabled: integer("enabled").notNull().default(0),
  configuration: text("configuration").notNull().default("{}"),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.businessId, table.provider] }),
  index("business_integrations_business_idx").on(table.businessId),
]);

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(1),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(0),
  lastLoginAt: integer("last_login_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("app_users_email_uq").on(table.email)]);

export const appSessions = sqliteTable("app_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("app_sessions_token_uq").on(table.tokenHash),
  index("app_sessions_user_idx").on(table.userId),
  index("app_sessions_expiry_idx").on(table.expiresAt),
]);

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("password_reset_tokens_hash_uq").on(table.tokenHash),
  index("password_reset_tokens_user_idx").on(table.userId),
  index("password_reset_tokens_expiry_idx").on(table.expiresAt),
]);

export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  phoneNumber: text("phone_number").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  agentActive: integer("agent_active", { mode: "boolean" }).notNull().default(1),
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
  agentActive: integer("agent_active", { mode: "boolean" }).notNull().default(1),
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
  mediaDeleted: integer("media_deleted", { mode: "boolean" }).notNull().default(0),
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

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("tags_business_name_uq").on(table.businessId, table.name)]);

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  type: text("type").notNull(),
  concept: text("concept").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull(),
  category: text("category").notNull(),
  transactionDate: integer("transaction_date").notNull(),
  status: text("status").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("transactions_business_date_idx").on(table.businessId, table.transactionDate),
  index("transactions_business_type_idx").on(table.businessId, table.type),
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

export const businessSettings = sqliteTable("business_settings", {
  businessId: text("business_id").primaryKey(),
  storeOpen: integer("store_open", { mode: "boolean" }).notNull().default(1),
  delayMinutes: integer("delay_minutes").notNull().default(30),
  courierActive: integer("courier_active", { mode: "boolean" }).notNull().default(1),
  address: text("address"),
  activeAlias: integer("active_alias").default(1),
  alias1Name: text("alias_1_name"),
  alias1Bank: text("alias_1_bank"),
  alias1Holder: text("alias_1_holder"),
  alias2Name: text("alias_2_name"),
  alias2Bank: text("alias_2_bank"),
  alias2Holder: text("alias_2_holder"),
  shippingZones: text("shipping_zones"),
  scheduleLunch: text("schedule_lunch"),
  scheduleDinner: text("schedule_dinner"),
  scheduleNotes: text("schedule_notes"),
  updatedAt: integer("updated_at").notNull(),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  aliases: text("aliases").notNull().default("[]"),
  active: integer("active", { mode: "boolean" }).notNull().default(1),
  stockStatus: text("stock_status").notNull().default("available"),
  stockQuantity: integer("stock_quantity"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("products_business_name_uq").on(table.businessId, table.name),
  index("products_business_status_idx").on(table.businessId, table.stockStatus),
]);

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  contactId: text("contact_id").notNull(),
  orderNumber: integer("order_number").notNull(),
  customerName: text("customer_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  deliveryType: text("delivery_type").notNull(),
  address: text("address"),
  zone: text("zone"),
  paymentMethod: text("payment_method").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  subtotal: real("subtotal").notNull(),
  shippingCost: real("shipping_cost").notNull().default(0),
  total: real("total").notNull(),
  status: text("status").notNull().default("confirmed"),
  receiptUrl: text("receipt_url"),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("orders_business_number_uq").on(table.businessId, table.orderNumber),
  index("orders_business_status_idx").on(table.businessId, table.status),
  index("orders_business_contact_idx").on(table.businessId, table.contactId),
  index("orders_business_created_idx").on(table.businessId, table.createdAt),
]);

export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  orderId: text("order_id").notNull(),
  productId: text("product_id"),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  subtotal: real("subtotal").notNull(),
}, (table) => [
  index("order_items_business_order_idx").on(table.businessId, table.orderId),
]);

export const handoffs = sqliteTable("handoffs", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  contactId: text("contact_id"),
  orderId: text("order_id"),
  phoneNumber: text("phone_number"),
  customerName: text("customer_name").notNull(),
  reason: text("reason").notNull(),
  summary: text("summary").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  assignedTo: text("assigned_to"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  resolvedAt: integer("resolved_at"),
}, (table) => [
  index("handoffs_business_status_idx").on(table.businessId, table.status),
  index("handoffs_business_created_idx").on(table.businessId, table.createdAt),
  index("handoffs_business_contact_idx").on(table.businessId, table.contactId),
]);
