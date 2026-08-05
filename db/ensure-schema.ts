import { getD1 } from "./index";

let schemaReady: Promise<void> | null = null;

const statements = [
  `CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, business_type TEXT NOT NULL DEFAULT 'restaurant', plan TEXT NOT NULL DEFAULT 'base', n8n_webhook_url TEXT, integration_key_hash TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS memberships (business_id TEXT NOT NULL, user_id TEXT NOT NULL, email TEXT, role TEXT NOT NULL DEFAULT 'staff', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, PRIMARY KEY (business_id, user_id))`,
  `CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id)`,
  `CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, phone_number TEXT NOT NULL, name TEXT NOT NULL, email TEXT, notes TEXT, agent_active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS contacts_business_phone_uq ON contacts (business_id, phone_number)`,
  `CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, phone_number TEXT NOT NULL, user_name TEXT NOT NULL, agent_active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS chats_business_phone_uq ON chats (business_id, phone_number)`,
  `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, phone_number TEXT NOT NULL, message TEXT NOT NULL, sender TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'text', status TEXT, storage_path TEXT, content_type TEXT, media_deleted INTEGER NOT NULL DEFAULT 0, media_deleted_at INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS messages_business_phone_idx ON messages (business_id, phone_number)`,
  `CREATE INDEX IF NOT EXISTS messages_business_created_idx ON messages (business_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS chat_tags (business_id TEXT NOT NULL, phone_number TEXT NOT NULL, tag TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (business_id, phone_number, tag))`,
  `CREATE TABLE IF NOT EXISTS pipeline_columns (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, position INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS pipeline_columns_business_position_idx ON pipeline_columns (business_id, position)`,
  `CREATE TABLE IF NOT EXISTS pipeline_leads (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, column_id TEXT NOT NULL, contact_id TEXT, client_name TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'ARS', email TEXT, phone TEXT, notes TEXT, priority TEXT NOT NULL DEFAULT 'media', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS pipeline_leads_business_column_idx ON pipeline_leads (business_id, column_id)`,
  `CREATE INDEX IF NOT EXISTS pipeline_leads_business_created_idx ON pipeline_leads (business_id, created_at)`,
];

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const db = getD1();
    schemaReady = db.batch(statements.map((sql) => db.prepare(sql))).then(() => undefined);
  }
  return schemaReady;
}
