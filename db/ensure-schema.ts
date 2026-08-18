import { getD1 } from "./index";

let schemaReady: Promise<void> | null = null;

const statements = [
  `CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, business_type TEXT NOT NULL DEFAULT 'restaurant', plan TEXT NOT NULL DEFAULT 'base', n8n_webhook_url TEXT, integration_key_hash TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS memberships (business_id TEXT NOT NULL, user_id TEXT NOT NULL, email TEXT, role TEXT NOT NULL DEFAULT 'staff', active BIGINT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, PRIMARY KEY (business_id, user_id))`,
  `CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id)`,
  `CREATE TABLE IF NOT EXISTS business_modules (business_id TEXT NOT NULL, module TEXT NOT NULL, enabled BIGINT NOT NULL DEFAULT 1, updated_at BIGINT NOT NULL, PRIMARY KEY (business_id, module))`,
  `CREATE INDEX IF NOT EXISTS business_modules_business_idx ON business_modules (business_id)`,
  `CREATE TABLE IF NOT EXISTS business_integrations (business_id TEXT NOT NULL, provider TEXT NOT NULL, enabled BIGINT NOT NULL DEFAULT 0, configuration TEXT NOT NULL DEFAULT '{}', updated_at BIGINT NOT NULL, PRIMARY KEY (business_id, provider))`,
  `CREATE INDEX IF NOT EXISTS business_integrations_business_idx ON business_integrations (business_id)`,
  `CREATE TABLE IF NOT EXISTS app_users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, active BIGINT NOT NULL DEFAULT 1, must_change_password BIGINT NOT NULL DEFAULT 0, last_login_at BIGINT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_uq ON app_users (email)`,
  `CREATE TABLE IF NOT EXISTS app_sessions (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS app_sessions_token_uq ON app_sessions (token_hash)`,
  `CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions (expires_at)`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at BIGINT NOT NULL, used_at BIGINT, created_at BIGINT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_hash_uq ON password_reset_tokens (token_hash)`,
  `CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id)`,
  `CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry_idx ON password_reset_tokens (expires_at)`,
  `CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, phone_number TEXT NOT NULL, name TEXT NOT NULL, email TEXT, address TEXT, notes TEXT, agent_active BIGINT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS contacts_business_phone_uq ON contacts (business_id, phone_number)`,
  `CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, phone_number TEXT NOT NULL, user_name TEXT NOT NULL, agent_active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS chats_business_phone_uq ON chats (business_id, phone_number)`,
  `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, phone_number TEXT NOT NULL, message TEXT NOT NULL, sender TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'text', status TEXT, storage_path TEXT, content_type TEXT, media_deleted INTEGER NOT NULL DEFAULT 0, media_deleted_at INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS messages_business_phone_idx ON messages (business_id, phone_number)`,
  `CREATE INDEX IF NOT EXISTS messages_business_created_idx ON messages (business_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS chat_tags (business_id TEXT NOT NULL, phone_number TEXT NOT NULL, tag TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (business_id, phone_number, tag))`,
  `CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tags_business_name_uq ON tags (business_id, name)`,
  `CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, type TEXT NOT NULL, concept TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL, category TEXT NOT NULL, transaction_date INTEGER NOT NULL, status TEXT NOT NULL, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS transactions_business_date_idx ON transactions (business_id, transaction_date)`,
  `CREATE INDEX IF NOT EXISTS transactions_business_type_idx ON transactions (business_id, type)`,
  `CREATE TABLE IF NOT EXISTS pipeline_columns (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, position INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS pipeline_columns_business_position_idx ON pipeline_columns (business_id, position)`,
  `CREATE TABLE IF NOT EXISTS pipeline_leads (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, column_id TEXT NOT NULL, contact_id TEXT, client_name TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'ARS', email TEXT, phone TEXT, notes TEXT, priority TEXT NOT NULL DEFAULT 'media', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS pipeline_leads_business_column_idx ON pipeline_leads (business_id, column_id)`,
  `CREATE INDEX IF NOT EXISTS pipeline_leads_business_created_idx ON pipeline_leads (business_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS business_settings (business_id TEXT PRIMARY KEY NOT NULL, store_open INTEGER NOT NULL DEFAULT 1, delay_minutes INTEGER NOT NULL DEFAULT 30, courier_active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, name TEXT NOT NULL, price REAL NOT NULL, aliases TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, stock_status TEXT NOT NULL DEFAULT 'available', stock_quantity INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS products_business_name_uq ON products (business_id, name)`,
  `CREATE INDEX IF NOT EXISTS products_business_status_idx ON products (business_id, stock_status)`,
  `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, contact_id TEXT NOT NULL, order_number INTEGER NOT NULL, customer_name TEXT NOT NULL, phone_number TEXT NOT NULL, delivery_type TEXT NOT NULL, address TEXT, zone TEXT, payment_method TEXT NOT NULL, scheduled_time TEXT NOT NULL, subtotal REAL NOT NULL, shipping_cost REAL NOT NULL DEFAULT 0, total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_business_number_uq ON orders (business_id, order_number)`,
  `CREATE INDEX IF NOT EXISTS orders_business_status_idx ON orders (business_id, status)`,
  `CREATE INDEX IF NOT EXISTS orders_business_contact_idx ON orders (business_id, contact_id)`,
  `CREATE INDEX IF NOT EXISTS orders_business_created_idx ON orders (business_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, order_id TEXT NOT NULL, product_id TEXT, product_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, subtotal REAL NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS order_items_business_order_idx ON order_items (business_id, order_id)`,
  `CREATE TABLE IF NOT EXISTS handoffs (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, contact_id TEXT, order_id TEXT, phone_number TEXT, customer_name TEXT NOT NULL, reason TEXT NOT NULL, summary TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'open', assigned_to TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, resolved_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS handoffs_business_status_idx ON handoffs (business_id, status)`,
  `CREATE INDEX IF NOT EXISTS handoffs_business_created_idx ON handoffs (business_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS handoffs_business_contact_idx ON handoffs (business_id, contact_id)`,
];

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const db = getD1();
    schemaReady = db.batch([
      ...statements.map((sql) => db.prepare(sql.replaceAll(" INTEGER", " BIGINT"))),
      db.prepare("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address TEXT"),
    ]).then(() => undefined);
  }
  return schemaReady;
}
