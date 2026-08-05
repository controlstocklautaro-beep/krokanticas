import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId);
    const db = getD1();
    const [totals, history, topContacts, tagDistribution, finances] = await Promise.all([
      db.prepare(`SELECT (SELECT COUNT(*) FROM chats WHERE business_id = ?) AS chats, (SELECT COUNT(*) FROM contacts WHERE business_id = ?) AS contacts, COUNT(*) AS messages, SUM(CASE WHEN sender = 'user' THEN 1 ELSE 0 END) AS user_messages, SUM(CASE WHEN sender = 'agent' THEN 1 ELSE 0 END) AS agent_messages FROM messages WHERE business_id = ?`)
        .bind(businessId, businessId, businessId).first(),
      db.prepare(`SELECT strftime('%Y-%m', created_at / 1000, 'unixepoch') AS month, COUNT(*) AS messages, COUNT(DISTINCT phone_number) AS chats, SUM(CASE WHEN sender = 'user' THEN 1 ELSE 0 END) AS user, SUM(CASE WHEN sender = 'agent' THEN 1 ELSE 0 END) AS agent FROM messages WHERE business_id = ? GROUP BY month ORDER BY month DESC LIMIT 6`)
        .bind(businessId).all(),
      db.prepare(`SELECT m.phone_number, COALESCE(c.user_name, m.phone_number) AS name, COUNT(*) AS count FROM messages m LEFT JOIN chats c ON c.business_id = m.business_id AND c.phone_number = m.phone_number WHERE m.business_id = ? GROUP BY m.phone_number ORDER BY count DESC LIMIT 5`)
        .bind(businessId).all(),
      db.prepare(`SELECT t.id, t.name, t.color, COUNT(ct.phone_number) AS count FROM tags t LEFT JOIN chat_tags ct ON ct.business_id = t.business_id AND ct.tag = t.name WHERE t.business_id = ? GROUP BY t.id ORDER BY count DESC`)
        .bind(businessId).all(),
      db.prepare(`SELECT type, currency, SUM(amount) AS total FROM transactions WHERE business_id = ? GROUP BY type, currency`)
        .bind(businessId).all(),
    ]);
    return NextResponse.json({ totals, history: history.results.reverse(), topContacts: topContacts.results, tagDistribution: tagDistribution.results, finances: finances.results });
  } catch (error) {
    return apiErrorResponse(error, "Error calculando métricas");
  }
}
