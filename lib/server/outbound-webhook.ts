import { getD1 } from "@/db";

const KROKANTICAS_WEBHOOK = "https://automation8n.fluxia.site/webhook/3e2c4ce3-7362-4db6-97d4-765886acce54";

export type OutboundMessage = {
  businessId: string;
  phone_number: string;
  message: string;
  type: "text" | "image" | "audio";
  media_url?: string;
  content_type?: string;
  file_name?: string;
};

async function webhookForBusiness(businessId: string): Promise<string | null> {
  const integration = await getD1().prepare("SELECT n8n_webhook_url FROM businesses WHERE id = ?")
    .bind(businessId).first<{ n8n_webhook_url: string | null }>();
  return integration?.n8n_webhook_url ||
    (businessId === "krokanticas" ? KROKANTICAS_WEBHOOK : process.env.N8N_WEBHOOK_URL || null);
}

export async function deliverOutboundMessage(payload: OutboundMessage): Promise<"sent" | "failed" | "not_configured"> {
  const webhookUrl = await webhookForBusiness(payload.businessId);
  if (!webhookUrl) return "not_configured";
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "outbound_message",
        source: "krokanticas-panel",
        ...payload,
      }),
    });
    if (!response.ok) {
      console.error("n8n webhook error", response.status);
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error("n8n webhook unavailable", error);
    return "failed";
  }
}
