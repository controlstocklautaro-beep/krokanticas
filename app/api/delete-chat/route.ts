import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { apiErrorResponse, businessIdFrom, normalizePhone } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; phone_number?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin", "manager"] });
    const phoneNumber = normalizePhone(body.phone_number);
    const db = getD1();
    const count = await db.prepare("SELECT COUNT(*) AS total FROM messages WHERE business_id = ? AND phone_number = ?")
      .bind(businessId, phoneNumber).first<{ total: number }>();
    await db.batch([
      db.prepare("DELETE FROM messages WHERE business_id = ? AND phone_number = ?").bind(businessId, phoneNumber),
      db.prepare("DELETE FROM chat_tags WHERE business_id = ? AND phone_number = ?").bind(businessId, phoneNumber),
      db.prepare("DELETE FROM chats WHERE business_id = ? AND phone_number = ?").bind(businessId, phoneNumber),
    ]);
    return NextResponse.json({ success: true, deleted_messages: Number(count?.total ?? 0) });
  } catch (error) {
    return apiErrorResponse(error, "Error al eliminar chat");
  }
}
