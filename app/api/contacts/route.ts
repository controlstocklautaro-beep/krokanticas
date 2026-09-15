import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom, normalizePhone } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { autoReactivateExpiredBots } from "@/lib/server/chat-store";

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    await autoReactivateExpiredBots(businessId);
    const rawPhone = new URL(req.url).searchParams.get("phone_number");
    const phoneNumber = rawPhone ? normalizePhone(rawPhone) : null;
    const result = phoneNumber ? await getD1().prepare(`
      SELECT id, phone_number, name, email, address, notes, agent_active, bot_paused_at, created_at, updated_at
      FROM contacts WHERE business_id = ? AND phone_number = ? ORDER BY created_at DESC
    `).bind(businessId, phoneNumber).all<Record<string, unknown>>() : await getD1().prepare(`
      SELECT id, phone_number, name, email, address, notes, agent_active, bot_paused_at, created_at, updated_at
      FROM contacts WHERE business_id = ? ORDER BY created_at DESC
    `).bind(businessId).all<Record<string, unknown>>();
    const contacts = result.results.map((contact) => ({
      ...contact,
      agent_active: Boolean(contact.agent_active),
      bot_paused_at: contact.bot_paused_at ? Number(contact.bot_paused_at) : null,
    }));
    return NextResponse.json({ contacts });
  } catch (error) {
    return apiErrorResponse(error, "Error listando contactos");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      businessId?: string;
      name?: string;
      phone_number?: string;
      email?: string;
      address?: string;
      notes?: string;
      agent_active?: boolean;
    };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "reception"] });
    const name = body.name?.trim();
    if (!name) throw new ApiError("Falta name", 400);
    const phoneNumber = normalizePhone(body.phone_number);
    const db = getD1();
    const existing = await db.prepare("SELECT id, name FROM contacts WHERE business_id = ? AND phone_number = ?")
      .bind(businessId, phoneNumber).first<{ id: string; name: string }>();

    const now = Date.now();
    const active = body.agent_active !== false ? 1 : 0;
    const botPausedAt = active ? null : now;

    if (existing) {
      // Si el contacto ya existe, conservamos su nombre para que llamadas de API/n8n no pisen el nombre real
      await db.batch([
        db.prepare(`
          UPDATE contacts SET
            email = COALESCE(?, email),
            address = COALESCE(?, address),
            notes = COALESCE(?, notes),
            agent_active = ?,
            bot_paused_at = ?,
            updated_at = ?
          WHERE id = ? AND business_id = ?
        `).bind(body.email?.trim() || null, body.address?.trim() || null, body.notes?.trim() || null, active, botPausedAt, now, existing.id, businessId),
        db.prepare(`
          INSERT INTO chats (id, business_id, phone_number, user_name, agent_active, bot_paused_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(business_id, phone_number) DO UPDATE SET agent_active = excluded.agent_active, bot_paused_at = excluded.bot_paused_at, updated_at = excluded.updated_at
        `).bind(`${businessId}:${phoneNumber}`, businessId, phoneNumber, existing.name, active, botPausedAt, now),
      ]);
      return NextResponse.json({ success: true, id: existing.id }, { status: 200 });
    }

    const id = crypto.randomUUID();
    await db.batch([
      db.prepare(`
        INSERT INTO contacts (id, business_id, phone_number, name, email, address, notes, agent_active, bot_paused_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, businessId, phoneNumber, name, body.email?.trim() || null, body.address?.trim() || null, body.notes?.trim() || null, active, botPausedAt, now, now),
      db.prepare(`
        INSERT INTO chats (id, business_id, phone_number, user_name, agent_active, bot_paused_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(business_id, phone_number) DO UPDATE SET user_name = excluded.user_name, agent_active = excluded.agent_active, bot_paused_at = excluded.bot_paused_at, updated_at = excluded.updated_at
      `).bind(`${businessId}:${phoneNumber}`, businessId, phoneNumber, name, active, botPausedAt, now),
    ]);
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Error creando contacto");
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as {
      businessId?: string;
      id?: string;
      contactId?: string;
      contact_id?: string;
      name?: string;
      customerName?: string;
      customer_name?: string;
      phone_number?: string;
      phoneNumber?: string;
      phone?: string;
      email?: string;
      address?: string;
      direccion?: string;
      notes?: string;
      notas?: string;
      agent_active?: boolean;
      agentActive?: boolean;
    };
    const businessId = businessIdFrom(req, body.businessId);
    const access = await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "reception"] });

    const contactId = body.id || body.contactId || body.contact_id;
    const rawPhone = body.phone_number || body.phoneNumber || body.phone;
    const normalizedLookupPhone = rawPhone ? normalizePhone(rawPhone) : null;

    if (!contactId && !normalizedLookupPhone) {
      throw new ApiError("Falta id o phone_number para identificar el contacto", 400);
    }

    const db = getD1();
    const current = contactId
      ? await db.prepare("SELECT id, phone_number, name, email, address, notes, agent_active, bot_paused_at FROM contacts WHERE id = ? AND business_id = ?")
          .bind(contactId, businessId).first<{ id: string; phone_number: string; name: string; email: string | null; address: string | null; notes: string | null; agent_active: number; bot_paused_at: number | null }>()
      : await db.prepare("SELECT id, phone_number, name, email, address, notes, agent_active, bot_paused_at FROM contacts WHERE phone_number = ? AND business_id = ?")
          .bind(normalizedLookupPhone, businessId).first<{ id: string; phone_number: string; name: string; email: string | null; address: string | null; notes: string | null; agent_active: number; bot_paused_at: number | null }>();

    if (!current) throw new ApiError("Contacto no encontrado", 404);

    const targetPhone = normalizedLookupPhone || current.phone_number;
    const isIntegration = access.role === "integration";
    const rawName = body.name ?? body.customerName ?? body.customer_name;
    // Las integraciones/API no pueden pisar el nombre de un contacto existente; sólo los usuarios desde el panel pueden modificarlo
    const name = (!isIntegration && rawName !== undefined && rawName.trim()) ? rawName.trim() : current.name;
    const rawAddress = body.address ?? body.direccion;
    const address = rawAddress !== undefined ? (rawAddress.trim() || null) : current.address;
    const rawNotes = body.notes ?? body.notas;
    const notes = rawNotes !== undefined ? (rawNotes.trim() || null) : current.notes;
    const email = body.email !== undefined ? (body.email.trim() || null) : current.email;

    const rawAgentActive = body.agent_active ?? body.agentActive;
    const agentActive = typeof rawAgentActive === "boolean"
      ? (rawAgentActive ? 1 : 0)
      : (rawAgentActive !== undefined ? (Number(rawAgentActive) ? 1 : 0) : (current.agent_active ? 1 : 0));

    const now = Date.now();
    const botPausedAt = agentActive === 1 ? null : (current.agent_active === 0 && current.bot_paused_at ? current.bot_paused_at : now);

    await db.batch([
      db.prepare("UPDATE contacts SET phone_number = ?, name = ?, email = ?, address = ?, notes = ?, agent_active = ?, bot_paused_at = ?, updated_at = ? WHERE id = ? AND business_id = ?")
        .bind(targetPhone, name, email, address, notes, agentActive, botPausedAt, now, current.id, businessId),
      db.prepare(`
        INSERT INTO chats (id, business_id, phone_number, user_name, agent_active, bot_paused_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(business_id, phone_number) DO UPDATE SET user_name = excluded.user_name, agent_active = excluded.agent_active, bot_paused_at = excluded.bot_paused_at, updated_at = excluded.updated_at
      `).bind(`${businessId}:${targetPhone}`, businessId, targetPhone, name, agentActive, botPausedAt, now),
      db.prepare("UPDATE messages SET phone_number = ? WHERE business_id = ? AND phone_number = ?")
        .bind(targetPhone, businessId, current.phone_number),
    ]);
    return NextResponse.json({ success: true, contact: { id: current.id, phone_number: targetPhone, name, address, notes, email, agent_active: Boolean(agentActive), bot_paused_at: botPausedAt } });
  } catch (error) {
    return apiErrorResponse(error, "Error actualizando contacto");
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; id?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    await getD1().prepare("DELETE FROM contacts WHERE id = ? AND business_id = ?").bind(body.id, businessId).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Error eliminando contacto");
  }
}
