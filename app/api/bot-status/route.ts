import { getD1 } from "@/db";
import { apiErrorResponse, businessIdFrom, noStoreJson, normalizePhone } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { getChat } from "@/lib/server/chat-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const phoneNumber = normalizePhone(url.searchParams.get("phone_number"));
    const chat = await getChat(businessId, phoneNumber);
    if (chat) {
      return noStoreJson({ agent_active: Boolean(chat.agent_active) });
    }
    const contact = await getD1().prepare("SELECT agent_active FROM contacts WHERE business_id = ? AND phone_number = ?")
      .bind(businessId, phoneNumber).first<{ agent_active: number | boolean }>();
    if (contact) {
      return noStoreJson({ agent_active: Boolean(contact.agent_active) });
    }
    return noStoreJson({ agent_active: true });
  } catch (error) {
    return apiErrorResponse(error, "Error en bot-status");
  }
}
