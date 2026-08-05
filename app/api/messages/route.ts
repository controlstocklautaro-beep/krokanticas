import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { apiErrorResponse, businessIdFrom, normalizePhone } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId);
    const phoneNumber = normalizePhone(url.searchParams.get("phone_number"));
    const result = await getD1().prepare(`
      SELECT id, phone_number, sender, message, type, status, storage_path, content_type, media_deleted, media_deleted_at, created_at
      FROM messages WHERE business_id = ? AND phone_number = ? ORDER BY created_at ASC LIMIT 500
    `).bind(businessId, phoneNumber).all<Record<string, unknown>>();
    return NextResponse.json({
      messages: result.results.map((message) => ({ ...message, media_deleted: Boolean(message.media_deleted) })),
    });
  } catch (error) {
    return apiErrorResponse(error, "Error listando mensajes");
  }
}
