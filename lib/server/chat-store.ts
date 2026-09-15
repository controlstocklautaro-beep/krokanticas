import { getD1 } from "@/db";

export type StoredChat = {
  phone_number: string;
  user_name: string;
  agent_active: number;
  bot_paused_at?: number | null;
  updated_at: number;
};

export const WHATSAPP_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const BOT_PAUSE_DURATION_MS = 60 * 60 * 1000; // 1 hora de pausa antes de reactivar automáticamente

export async function autoReactivateExpiredBots(businessId: string, phoneNumber?: string) {
  const db = getD1();
  const threshold = Date.now() - BOT_PAUSE_DURATION_MS;
  const now = Date.now();

  try {
    if (phoneNumber) {
      await db.batch([
        db.prepare(`
          UPDATE chats SET agent_active = 1, bot_paused_at = NULL, updated_at = ?
          WHERE business_id = ? AND phone_number = ? AND agent_active = 0
            AND ((bot_paused_at IS NOT NULL AND bot_paused_at <= ?) OR (bot_paused_at IS NULL AND updated_at <= ?))
        `).bind(now, businessId, phoneNumber, threshold, threshold),
        db.prepare(`
          UPDATE contacts SET agent_active = 1, bot_paused_at = NULL, updated_at = ?
          WHERE business_id = ? AND phone_number = ? AND agent_active = 0
            AND ((bot_paused_at IS NOT NULL AND bot_paused_at <= ?) OR (bot_paused_at IS NULL AND updated_at <= ?))
        `).bind(now, businessId, phoneNumber, threshold, threshold),
      ]);
    } else {
      await db.batch([
        db.prepare(`
          UPDATE chats SET agent_active = 1, bot_paused_at = NULL, updated_at = ?
          WHERE business_id = ? AND agent_active = 0
            AND ((bot_paused_at IS NOT NULL AND bot_paused_at <= ?) OR (bot_paused_at IS NULL AND updated_at <= ?))
        `).bind(now, businessId, threshold, threshold),
        db.prepare(`
          UPDATE contacts SET agent_active = 1, bot_paused_at = NULL, updated_at = ?
          WHERE business_id = ? AND agent_active = 0
            AND ((bot_paused_at IS NOT NULL AND bot_paused_at <= ?) OR (bot_paused_at IS NULL AND updated_at <= ?))
        `).bind(now, businessId, threshold, threshold),
      ]);
    }
  } catch {
    // Si la columna bot_paused_at no estuviese disponible, no romper el flujo
  }
}

export async function whatsappReplyWindow(businessId: string, phoneNumber: string, now = Date.now()) {
  const latest = await getD1().prepare(`
    SELECT created_at FROM messages
    WHERE business_id = ? AND phone_number = ? AND sender = 'user'
    ORDER BY created_at DESC LIMIT 1
  `).bind(businessId, phoneNumber).first<{ created_at: number }>();
  const lastInboundAt = latest ? Number(latest.created_at) : null;
  return {
    lastInboundAt,
    canReply: lastInboundAt !== null && now - lastInboundAt <= WHATSAPP_REPLY_WINDOW_MS,
  };
}

export async function getChat(businessId: string, phoneNumber: string) {
  return getD1().prepare("SELECT phone_number, user_name, agent_active, bot_paused_at, updated_at FROM chats WHERE business_id = ? AND phone_number = ?")
    .bind(businessId, phoneNumber).first<StoredChat>();
}

export async function upsertChat(businessId: string, phoneNumber: string, userName: string, timestamp = Date.now()) {
  const db = getD1();
  const contact = await db.prepare("SELECT name FROM contacts WHERE business_id = ? AND phone_number = ?")
    .bind(businessId, phoneNumber).first<{ name: string }>();
  const chat = await db.prepare("SELECT user_name FROM chats WHERE business_id = ? AND phone_number = ?")
    .bind(businessId, phoneNumber).first<{ user_name: string }>();
  const establishedName = contact?.name?.trim() || chat?.user_name?.trim() || userName;

  await db.prepare(`
    INSERT INTO chats (id, business_id, phone_number, user_name, agent_active, updated_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(business_id, phone_number) DO UPDATE SET
      user_name = excluded.user_name,
      updated_at = excluded.updated_at
  `).bind(`${businessId}:${phoneNumber}`, businessId, phoneNumber, establishedName, timestamp).run();
}

export async function ensureContact(businessId: string, phoneNumber: string, requestedName?: string) {
  const db = getD1();
  const existing = await db.prepare("SELECT id, name FROM contacts WHERE business_id = ? AND phone_number = ?")
    .bind(businessId, phoneNumber).first<{ id: string; name: string }>();
  if (existing) return existing;
  const existingChat = await db.prepare("SELECT user_name FROM chats WHERE business_id = ? AND phone_number = ?")
    .bind(businessId, phoneNumber).first<{ user_name: string }>();
  const id = crypto.randomUUID();
  const name = existingChat?.user_name?.trim() || requestedName?.trim() || phoneNumber;
  const now = Date.now();
  await db.prepare("INSERT INTO contacts (id, business_id, phone_number, name, agent_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)")
    .bind(id, businessId, phoneNumber, name, now, now).run();
  return { id, name };
}

export async function insertMessage(input: {
  businessId: string;
  phoneNumber: string;
  message: string;
  sender: "user" | "agent";
  type?: string;
  status?: string | null;
  storagePath?: string | null;
  contentType?: string | null;
  createdAt?: number;
}) {
  const id = crypto.randomUUID();
  const createdAt = input.createdAt ?? Date.now();
  await getD1().prepare(`
    INSERT INTO messages (id, business_id, phone_number, message, sender, type, status, storage_path, content_type, media_deleted, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).bind(
    id, input.businessId, input.phoneNumber, input.message, input.sender, input.type ?? "text",
    input.status ?? null, input.storagePath ?? null, input.contentType ?? null, createdAt,
  ).run();
  return id;
}

export async function tagsForChat(businessId: string, phoneNumber: string): Promise<string[]> {
  const rows = await getD1().prepare("SELECT tag FROM chat_tags WHERE business_id = ? AND phone_number = ? ORDER BY created_at ASC")
    .bind(businessId, phoneNumber).all<{ tag: string }>();
  return rows.results.map((row) => row.tag);
}
