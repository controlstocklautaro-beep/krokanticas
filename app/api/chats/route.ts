import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { autoReactivateExpiredBots } from "@/lib/server/chat-store";

const MAX_LIMIT = 500;

function msParam(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Lista de chats, ordenada por actividad (updated_at desc). Sin parámetros devuelve todos (lo usa n8n).
// El panel pide de a páginas para no bajar los 1.000 chats en cada refresco (eso agotaba el egress de Supabase):
//   limit=N          → los N más recientes
//   before=<ms>      → los anteriores a ese updated_at (siguiente página al scrollear)
//   since=<ms>       → solo los que cambiaron después de ese updated_at (refresco en vivo)
//   q=texto          → busca por nombre o teléfono
//   agent_active=0|1 → solo bot apagado / encendido
//   tag=nombre       → solo chats con esa etiqueta
//   phone=+549...    → ese chat en particular
export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    await autoReactivateExpiredBots(businessId);
    const url = new URL(req.url);
    const p = url.searchParams;

    const where: string[] = ["c.business_id = ?"];
    const params: unknown[] = [businessId];
    const before = msParam(p.get("before"));
    const since = msParam(p.get("since"));
    if (before !== null) { where.push("c.updated_at < ?"); params.push(before); }
    if (since !== null) { where.push("c.updated_at > ?"); params.push(since); }
    const phone = (p.get("phone") || "").trim();
    if (phone) { where.push("c.phone_number = ?"); params.push(phone); }
    const q = (p.get("q") || "").trim();
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
      where.push("(c.phone_number ILIKE ? OR c.user_name ILIKE ? OR COALESCE(ct.name, '') ILIKE ?)");
      params.push(like, like, like);
    }
    const agentActive = p.get("agent_active");
    if (agentActive === "0" || agentActive === "1") { where.push("c.agent_active = ?"); params.push(Number(agentActive)); }
    const tag = (p.get("tag") || "").trim();
    if (tag) {
      where.push("EXISTS (SELECT 1 FROM chat_tags x WHERE x.business_id = c.business_id AND x.phone_number = c.phone_number AND x.tag = ?)");
      params.push(tag);
    }
    const rawLimit = msParam(p.get("limit"));
    const limit = rawLimit !== null && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_LIMIT) : null;
    if (limit !== null) params.push(limit);

    const result = await getD1().prepare(`
      SELECT c.phone_number, COALESCE(NULLIF(ct.name, ''), c.user_name) AS user_name, c.agent_active, c.bot_paused_at, c.updated_at,
        COALESCE(string_agg(t.tag, '||'), '') AS tags,
        (SELECT m.message FROM messages m WHERE m.business_id = c.business_id AND m.phone_number = c.phone_number ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT m.sender FROM messages m WHERE m.business_id = c.business_id AND m.phone_number = c.phone_number ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
        (SELECT m.created_at FROM messages m WHERE m.business_id = c.business_id AND m.phone_number = c.phone_number ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
      FROM chats c
      LEFT JOIN contacts ct ON ct.business_id = c.business_id AND (ct.phone_number = c.phone_number OR (LENGTH(ct.phone_number) >= 8 AND LENGTH(c.phone_number) >= 8 AND RIGHT(ct.phone_number, 8) = RIGHT(c.phone_number, 8)))
      LEFT JOIN chat_tags t ON t.business_id = c.business_id AND t.phone_number = c.phone_number
      WHERE ${where.join(" AND ")}
      GROUP BY c.id, c.phone_number, c.user_name, ct.name, c.agent_active, c.bot_paused_at, c.updated_at, c.business_id
      ORDER BY c.updated_at DESC
      ${limit !== null ? "LIMIT ?" : ""}
    `).bind(...params).all<Record<string, unknown>>();
    const chats = result.results.map((chat) => ({
      ...chat,
      agent_active: Boolean(chat.agent_active),
      bot_paused_at: chat.bot_paused_at ? Number(chat.bot_paused_at) : null,
      tags: typeof chat.tags === "string" && chat.tags ? chat.tags.split("||") : [],
    }));
    return NextResponse.json({ chats });
  } catch (error) {
    return apiErrorResponse(error, "Error listando chats");
  }
}
