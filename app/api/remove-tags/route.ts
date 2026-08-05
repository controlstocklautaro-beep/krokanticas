import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { apiErrorResponse, businessIdFrom, normalizePhone, stringArray } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; phone_number?: string; tags?: unknown };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const phoneNumber = normalizePhone(body.phone_number);
    const tags = stringArray(body.tags, "tags");
    const db = getD1();
    await db.batch(tags.map((tag) => db.prepare(
      "DELETE FROM chat_tags WHERE business_id = ? AND phone_number = ? AND tag = ?",
    ).bind(businessId, phoneNumber, tag)));
    return NextResponse.json({ success: true, removed: tags });
  } catch (error) {
    return apiErrorResponse(error, "Error quitando etiquetas");
  }
}
