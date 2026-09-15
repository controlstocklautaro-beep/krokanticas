import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom, normalizePhone } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { getChat, upsertChat } from "@/lib/server/chat-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; phone_number?: string; agent_active?: boolean };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const phoneNumber = normalizePhone(body.phone_number);
    if (typeof body.agent_active !== "boolean") throw new ApiError("Parámetros inválidos", 400);
    const chat = await getChat(businessId, phoneNumber);
    let userName = chat?.user_name;
    if (!userName) {
      const contact = await getD1().prepare("SELECT name FROM contacts WHERE business_id = ? AND phone_number = ?")
        .bind(businessId, phoneNumber).first<{ name: string }>();
      userName = contact?.name ?? phoneNumber;
    }
    await upsertChat(businessId, phoneNumber, userName);
    const now = Date.now();
    const active = body.agent_active ? 1 : 0;
    const botPausedAt = body.agent_active ? null : now;
    const db = getD1();
    await db.batch([
      db.prepare("UPDATE chats SET agent_active = ?, bot_paused_at = ?, updated_at = ? WHERE business_id = ? AND phone_number = ?")
        .bind(active, botPausedAt, now, businessId, phoneNumber),
      db.prepare("UPDATE contacts SET agent_active = ?, bot_paused_at = ?, updated_at = ? WHERE business_id = ? AND phone_number = ?")
        .bind(active, botPausedAt, now, businessId, phoneNumber),
    ]);
    return NextResponse.json({ success: true, agent_active: body.agent_active, bot_paused_at: botPausedAt });
  } catch (error) {
    return apiErrorResponse(error, "Error en toggle-bot");
  }
}
