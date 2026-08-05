import { NextResponse } from "next/server";
import { ApiError, apiErrorResponse, businessIdFrom, normalizePhone } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { ensureContact, insertMessage, upsertChat } from "@/lib/server/chat-store";

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      businessId?: string;
      phone_number?: string;
      user_name?: string;
      message?: string;
      sender?: "user" | "agent";
    };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const phoneNumber = normalizePhone(body.phone_number);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) throw new ApiError("Faltan datos requeridos", 400);
    if (message.length > 10_000) throw new ApiError("El mensaje es demasiado largo", 413);
    const contact = await ensureContact(businessId, phoneNumber, body.user_name);
    await upsertChat(businessId, phoneNumber, contact.name);
    await insertMessage({
      businessId,
      phoneNumber,
      message,
      sender: body.sender === "agent" ? "agent" : "user",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Error en ingest-message");
  }
}
