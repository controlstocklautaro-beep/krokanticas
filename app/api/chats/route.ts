import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const result = await getD1().prepare(`
      SELECT c.phone_number, c.user_name, c.agent_active, c.updated_at,
        COALESCE(string_agg(t.tag, '||'), '') AS tags,
        (SELECT m.message FROM messages m WHERE m.business_id = c.business_id AND m.phone_number = c.phone_number ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT m.sender FROM messages m WHERE m.business_id = c.business_id AND m.phone_number = c.phone_number ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
        (SELECT m.created_at FROM messages m WHERE m.business_id = c.business_id AND m.phone_number = c.phone_number ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
      FROM chats c LEFT JOIN chat_tags t ON t.business_id = c.business_id AND t.phone_number = c.phone_number
      WHERE c.business_id = ? GROUP BY c.id, c.phone_number, c.user_name, c.agent_active, c.updated_at, c.business_id ORDER BY c.updated_at DESC
    `).bind(businessId).all<Record<string, unknown>>();
    const chats = result.results.map((chat) => ({
      ...chat,
      agent_active: Boolean(chat.agent_active),
      tags: typeof chat.tags === "string" && chat.tags ? chat.tags.split("||") : [],
    }));
    return NextResponse.json({ chats });
  } catch (error) {
    return apiErrorResponse(error, "Error listando chats");
  }
}
