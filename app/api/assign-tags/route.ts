import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { apiErrorResponse, businessIdFrom, normalizePhone, stringArray } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { getChat, tagsForChat, upsertChat } from "@/lib/server/chat-store";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; phone_number?: string; tags?: unknown };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const phoneNumber = normalizePhone(body.phone_number);
    const tags = stringArray(body.tags, "tags");
    const chat = await getChat(businessId, phoneNumber);
    await upsertChat(businessId, phoneNumber, chat?.user_name ?? phoneNumber);
    const db = getD1();
    const now = Date.now();
    await db.batch(tags.map((tag) => db.prepare(
      "INSERT OR IGNORE INTO chat_tags (business_id, phone_number, tag, created_at) VALUES (?, ?, ?, ?)",
    ).bind(businessId, phoneNumber, tag, now)));
    return NextResponse.json({ success: true, tags: await tagsForChat(businessId, phoneNumber) });
  } catch (error) {
    return apiErrorResponse(error, "Error asignando etiquetas");
  }
}
