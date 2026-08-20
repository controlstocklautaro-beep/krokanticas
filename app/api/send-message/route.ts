import { NextResponse } from "next/server";
import { ApiError, apiErrorResponse, businessIdFrom, normalizePhone } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { getChat, insertMessage, upsertChat, whatsappReplyWindow } from "@/lib/server/chat-store";
import { deliverOutboundMessage } from "@/lib/server/outbound-webhook";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; phone_number?: string; message?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId);
    const phoneNumber = normalizePhone(body.phone_number);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) throw new ApiError("Faltan datos", 400);
    if (message.length > 10_000) throw new ApiError("El mensaje es demasiado largo", 413);

    const replyWindow = await whatsappReplyWindow(businessId, phoneNumber);
    if (!replyWindow.canReply) {
      throw new ApiError("Pasaron más de 24 horas desde el último mensaje del cliente. Continuá desde WhatsApp.", 409);
    }

    const chat = await getChat(businessId, phoneNumber);
    await upsertChat(businessId, phoneNumber, chat?.user_name ?? phoneNumber);
    await insertMessage({ businessId, phoneNumber, message, sender: "agent", status: "delivered" });

    const delivery = await deliverOutboundMessage({ businessId, phone_number: phoneNumber, message, type: "text" });
    return NextResponse.json({ success: true, delivery });
  } catch (error) {
    return apiErrorResponse(error, "Error en send-message");
  }
}
