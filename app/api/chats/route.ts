import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { autoReactivateExpiredBots } from "@/lib/server/chat-store";

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    await autoReactivateExpiredBots(businessId);
    const result = await getD1().prepare(`
      SELECT c.phone_number, COALESCE(NULLIF(ct.name, ''), c.user_name) AS user_name, c.agent_active, c.bot_paused_at, c.updated_at,
        COALESCE(string_agg(t.tag, '||'), '') AS tags,
        (SELECT m.message FROM messages m WHERE m.business_id = c.business_id AND m.phone_number = c.phone_number ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT m.sender FROM messages m WHERE m.business_id = c.business_id AND m.phone_number = c.phone_number ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
        (SELECT m.created_at FROM messages m WHERE m.business_id = c.business_id AND m.phone_number = c.phone_number ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
      FROM chats c
      LEFT JOIN contacts ct ON ct.business_id = c.business_id AND ct.phone_number = c.phone_number
      LEFT JOIN chat_tags t ON t.business_id = c.business_id AND t.phone_number = c.phone_number
      WHERE c.business_id = ?
      GROUP BY c.id, c.phone_number, c.user_name, ct.name, c.agent_active, c.bot_paused_at, c.updated_at, c.business_id
      ORDER BY c.updated_at DESC
    `).bind(businessId).all<Record<string, unknown>>();
    const chats = result.results.map((chat) => ({
      ...chat,
      agent_active: Boolean(chat.agent_active),
      bot_paused_at: chat.bot_paused_at ? Number(chat.bot_paused_at) : null,
      tags: typeof chat.tags === "string" && chat.tags ? chat.tags.split("||") : [],
    }));
    return NextResponse.json({ chats });
  } catch (error) {
    return apiErrorResponse(error, "Error listando chats");
  }
}
