import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom, normalizePhone } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const result = await getD1().prepare(`
      SELECT id, phone_number, name, email, address, notes, agent_active, created_at, updated_at
      FROM contacts WHERE business_id = ? ORDER BY created_at DESC
    `).bind(businessId).all();
    return NextResponse.json({ contacts: result.results });
  } catch (error) {
    return apiErrorResponse(error, "Error listando contactos");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; name?: string; phone_number?: string; email?: string; address?: string; notes?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "reception"] });
    const name = body.name?.trim();
    if (!name) throw new ApiError("Falta name", 400);
    const phoneNumber = normalizePhone(body.phone_number);
    const id = crypto.randomUUID();
    const now = Date.now();
    const db = getD1();
    await db.batch([
      db.prepare(`
        INSERT INTO contacts (id, business_id, phone_number, name, email, address, notes, agent_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).bind(id, businessId, phoneNumber, name, body.email?.trim() || null, body.address?.trim() || null, body.notes?.trim() || null, now, now),
      db.prepare(`
        INSERT INTO chats (id, business_id, phone_number, user_name, agent_active, updated_at)
        VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(business_id, phone_number) DO UPDATE SET user_name = excluded.user_name, updated_at = excluded.updated_at
      `).bind(`${businessId}:${phoneNumber}`, businessId, phoneNumber, name, now),
    ]);
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Error creando contacto");
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; id?: string; name?: string; phone_number?: string; email?: string; address?: string; notes?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "reception"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    const current = await getD1().prepare("SELECT phone_number, name, email, address, notes FROM contacts WHERE id = ? AND business_id = ?")
      .bind(body.id, businessId).first<{ phone_number: string; name: string; email: string | null; address: string | null; notes: string | null }>();
    if (!current) throw new ApiError("Contacto no encontrado", 404);
    const phoneNumber = body.phone_number ? normalizePhone(body.phone_number) : current.phone_number;
    const name = body.name?.trim() || current.name;
    const db = getD1();
    await db.batch([
      db.prepare("UPDATE contacts SET phone_number = ?, name = ?, email = ?, address = ?, notes = ?, updated_at = ? WHERE id = ? AND business_id = ?")
        .bind(phoneNumber, name, body.email ?? current.email, body.address ?? current.address, body.notes ?? current.notes, Date.now(), body.id, businessId),
      db.prepare("UPDATE chats SET user_name = ?, phone_number = ?, updated_at = ? WHERE business_id = ? AND phone_number = ?")
        .bind(name, phoneNumber, Date.now(), businessId, current.phone_number),
      db.prepare("UPDATE messages SET phone_number = ? WHERE business_id = ? AND phone_number = ?")
        .bind(phoneNumber, businessId, current.phone_number),
    ]);
    return NextResponse.json({ success: true });
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
