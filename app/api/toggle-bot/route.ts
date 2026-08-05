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
    await upsertChat(businessId, phoneNumber, chat?.user_name ?? phoneNumber);
    const active = body.agent_active ? 1 : 0;
    const db = getD1();
    await db.batch([
      db.prepare("UPDATE chats SET agent_active = ?, updated_at = ? WHERE business_id = ? AND phone_number = ?")
        .bind(active, Date.now(), businessId, phoneNumber),
      db.prepare("UPDATE contacts SET agent_active = ?, updated_at = ? WHERE business_id = ? AND phone_number = ?")
        .bind(active, Date.now(), businessId, phoneNumber),
    ]);
    return NextResponse.json({ success: true, agent_active: body.agent_active });
  } catch (error) {
    return apiErrorResponse(error, "Error en toggle-bot");
  }
}
