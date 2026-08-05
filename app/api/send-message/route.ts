import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom, normalizePhone } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { getChat, insertMessage, upsertChat } from "@/lib/server/chat-store";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; phone_number?: string; message?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId);
    const phoneNumber = normalizePhone(body.phone_number);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) throw new ApiError("Faltan datos", 400);
    if (message.length > 10_000) throw new ApiError("El mensaje es demasiado largo", 413);

    const chat = await getChat(businessId, phoneNumber);
    await upsertChat(businessId, phoneNumber, chat?.user_name ?? phoneNumber);
    await insertMessage({ businessId, phoneNumber, message, sender: "agent", status: "delivered" });

    const integration = await getD1().prepare("SELECT n8n_webhook_url FROM businesses WHERE id = ?")
      .bind(businessId).first<{ n8n_webhook_url: string | null }>();
    const webhookUrl = integration?.n8n_webhook_url || process.env.N8N_WEBHOOK_URL;
    let delivery: "sent" | "failed" | "not_configured" = "not_configured";
    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId, phone_number: phoneNumber, message }),
        });
        delivery = response.ok ? "sent" : "failed";
        if (!response.ok) console.error("n8n webhook error", response.status);
      } catch (error) {
        delivery = "failed";
        console.error("n8n webhook unavailable", error);
      }
    }
    return NextResponse.json({ success: true, delivery });
  } catch (error) {
    return apiErrorResponse(error, "Error en send-message");
  }
}
