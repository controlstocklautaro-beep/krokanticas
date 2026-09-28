import { getD1 } from "@/db";
import { normalizePhone } from "@/lib/server/api-utils";

export type StoredChat = {
  phone_number: string;
  user_name: string;
  agent_active: number;
  bot_paused_at?: number | null;
  updated_at: number;
};

export type StoredContact = {
  id: string;
  name: string;
  phone_number: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  agent_active: number;
  bot_paused_at: number | null;
};

export const WHATSAPP_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const BOT_PAUSE_DURATION_MS = 60 * 60 * 1000; // 1 hora de pausa antes de reactivar automáticamente

const lastReactivateByBusiness = new Map<string, number>();

export async function autoReactivateExpiredBots(businessId: string, phoneNumber?: string) {
  if (!phoneNumber) {
    const last = lastReactivateByBusiness.get(businessId) || 0;
    if (Date.now() - last < 60_000) return;
    lastReactivateByBusiness.set(businessId, Date.now());
  }
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

export async function findExistingContact(businessId: string, rawPhone: string): Promise<StoredContact | null> {
  const db = getD1();
  let normalized = rawPhone;
  try {
    normalized = normalizePhone(rawPhone);
  } catch {
    // Mantener rawPhone si no pudo normalizarse
  }

  // 1. Coincidencia exacta con teléfono normalizado
  let contact = await db.prepare("SELECT id, name, phone_number, email, address, notes, agent_active, bot_paused_at FROM contacts WHERE business_id = ? AND phone_number = ?")
    .bind(businessId, normalized).first<StoredContact>();
  if (contact) return contact;

  // 2. Coincidencia flexible por los últimos 8-10 dígitos para contemplar contactos cargados con formato local
  const digits = normalized.replace(/\D/g, "");
  if (digits.length >= 8) {
    const suffix = digits.slice(-8);
    const candidates = await db.prepare("SELECT id, name, phone_number, email, address, notes, agent_active, bot_paused_at FROM contacts WHERE business_id = ? AND (phone_number = ? OR phone_number LIKE ?)")
      .bind(businessId, rawPhone, `%${suffix}`).all<StoredContact>();
    if (candidates.results.length > 0) {
      contact = candidates.results[0];
      // Si el contacto en la BD tenía un formato antiguo (ej. sin +549), actualizar su teléfono para que en el futuro coincida de inmediato
      if (contact.phone_number !== normalized) {
        await db.prepare("UPDATE contacts SET phone_number = ?, updated_at = ? WHERE id = ? AND business_id = ?")
          .bind(normalized, Date.now(), contact.id, businessId).run().catch(() => undefined);
      }
      return contact;
    }
  }
  return null;
}

export async function upsertChat(businessId: string, phoneNumber: string, userName: string, timestamp = Date.now()) {
  const db = getD1();
  const contact = await findExistingContact(businessId, phoneNumber);
  const chat = await db.prepare("SELECT user_name FROM chats WHERE business_id = ? AND phone_number = ?")
    .bind(businessId, phoneNumber).first<{ user_name: string }>();
  // Prioridad 1: Nombre agendado en contactos (el nombre real que puso Mati).
  // Prioridad 2: Nombre ya establecido en el chat (si no está agendado pero ya tenía un nombre previo).
  // Prioridad 3: Apodo recibido (userName).
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
  const existing = await findExistingContact(businessId, phoneNumber);
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
