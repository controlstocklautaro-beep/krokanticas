import { getD1 } from "@/db";
import { apiErrorResponse, businessIdFrom, noStoreJson, normalizePhone } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { whatsappReplyWindow } from "@/lib/server/chat-store";
import { mediaProxyUrl } from "@/lib/server/media-upload";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId);
    const phoneNumber = normalizePhone(url.searchParams.get("phone_number"));
    const result = await getD1().prepare(`
      SELECT * FROM (
        SELECT id, phone_number, sender, message, type, status, storage_path, content_type, media_deleted, media_deleted_at, created_at
        FROM messages WHERE business_id = ? AND phone_number = ? ORDER BY created_at DESC LIMIT 500
      ) recent ORDER BY created_at ASC
    `).bind(businessId, phoneNumber).all<Record<string, unknown>>();
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
