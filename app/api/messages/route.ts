import { getD1 } from "@/db";
import { apiErrorResponse, businessIdFrom, noStoreJson, normalizePhone } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { whatsappReplyWindow } from "@/lib/server/chat-store";
import { mediaProxyUrl } from "@/lib/server/media-upload";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

// Mensajes de un chat, del más viejo al más nuevo.
//   limit=N     → los últimos N (200 por defecto)
//   after=<ms>  → solo los creados a partir de ese momento (refresco en vivo: el panel pide esto cada pocos
//                 segundos en vez de volver a bajar la conversación entera)
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId);
    const phoneNumber = normalizePhone(url.searchParams.get("phone_number"));
    const after = Number(url.searchParams.get("after"));
    const rawLimit = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_LIMIT) : DEFAULT_LIMIT;
    const db = getD1();
    const result = Number.isFinite(after) && after > 0
      ? await db.prepare(`
          SELECT id, phone_number, sender, message, type, status, storage_path, content_type, media_deleted, media_deleted_at, created_at
          FROM messages WHERE business_id = ? AND phone_number = ? AND created_at >= ? ORDER BY created_at ASC LIMIT ?
        `).bind(businessId, phoneNumber, after, MAX_LIMIT).all<Record<string, unknown>>()
      : await db.prepare(`
          SELECT * FROM (
            SELECT id, phone_number, sender, message, type, status, storage_path, content_type, media_deleted, media_deleted_at, created_at
            FROM messages WHERE business_id = ? AND phone_number = ? ORDER BY created_at DESC LIMIT ?
          ) recent ORDER BY created_at ASC
        `).bind(businessId, phoneNumber, limit).all<Record<string, unknown>>();
    const replyWindow = await whatsappReplyWindow(businessId, phoneNumber);
    return noStoreJson({
      messages: result.results.map((message) => ({
        ...message,
        message: typeof message.storage_path === "string" && message.storage_path && !message.media_deleted
          ? mediaProxyUrl(message.storage_path)
          : message.message,
        media_deleted: Boolean(message.media_deleted),
      })),
      reply_window: {
        can_reply: replyWindow.canReply,
        last_inbound_at: replyWindow.lastInboundAt,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Error listando mensajes");
  }
}
