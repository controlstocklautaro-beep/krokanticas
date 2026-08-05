import { getD1 } from "@/db";

export type StoredChat = {
  phone_number: string;
  user_name: string;
  agent_active: number;
  updated_at: number;
};

export async function getChat(businessId: string, phoneNumber: string) {
  return getD1().prepare("SELECT phone_number, user_name, agent_active, updated_at FROM chats WHERE business_id = ? AND phone_number = ?")
    .bind(businessId, phoneNumber).first<StoredChat>();
}

export async function upsertChat(businessId: string, phoneNumber: string, userName: string, timestamp = Date.now()) {
  await getD1().prepare(`
    INSERT INTO chats (id, business_id, phone_number, user_name, agent_active, updated_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(business_id, phone_number) DO UPDATE SET user_name = excluded.user_name, updated_at = excluded.updated_at
  `).bind(`${businessId}:${phoneNumber}`, businessId, phoneNumber, userName, timestamp).run();
}

export async function ensureContact(businessId: string, phoneNumber: string, requestedName?: string) {
  const db = getD1();
  const existing = await db.prepare("SELECT id, name FROM contacts WHERE business_id = ? AND phone_number = ?")
    .bind(businessId, phoneNumber).first<{ id: string; name: string }>();
  if (existing) return existing;
  const id = crypto.randomUUID();
  const name = requestedName?.trim() || phoneNumber;
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
