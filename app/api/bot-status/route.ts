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
    return noStoreJson({ agent_active: chat ? Boolean(chat.agent_active) : true });
  } catch (error) {
    return apiErrorResponse(error, "Error en bot-status");
  }
}
