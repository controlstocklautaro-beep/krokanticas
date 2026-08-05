import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export async function POST(req: Request) {
  try {
    let explicitBusinessId: string | undefined;
    try {
      explicitBusinessId = (await req.json() as { businessId?: string }).businessId;
    } catch {
      explicitBusinessId = undefined;
    }
    const businessId = businessIdFrom(req, explicitBusinessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin"] });
    const db = getD1();
    const messageCount = await db.prepare("SELECT COUNT(*) AS total FROM messages WHERE business_id = ?")
      .bind(businessId).first<{ total: number }>();
    const chatCount = await db.prepare("SELECT COUNT(*) AS total FROM chats WHERE business_id = ?")
      .bind(businessId).first<{ total: number }>();
    await db.batch([
      db.prepare("DELETE FROM messages WHERE business_id = ?").bind(businessId),
      db.prepare("DELETE FROM chat_tags WHERE business_id = ?").bind(businessId),
      db.prepare("DELETE FROM chats WHERE business_id = ?").bind(businessId),
    ]);
    return NextResponse.json({
      success: true,
      deleted_chats: Number(chatCount?.total ?? 0),
      deleted_messages: Number(messageCount?.total ?? 0),
      message: "Todos los chats y mensajes de la empresa han sido eliminados correctamente.",
    });
  } catch (error) {
    return apiErrorResponse(error, "Error al eliminar todos los chats");
  }
}
