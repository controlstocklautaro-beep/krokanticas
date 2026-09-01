import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom, normalizePhone } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const rawPhone = new URL(req.url).searchParams.get("phone_number");
    const phoneNumber = rawPhone ? normalizePhone(rawPhone) : null;
    const result = phoneNumber ? await getD1().prepare(`
      SELECT id, phone_number, name, email, address, notes, agent_active, created_at, updated_at
      FROM contacts WHERE business_id = ? AND phone_number = ? ORDER BY created_at DESC
    `).bind(businessId, phoneNumber).all() : await getD1().prepare(`
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
    };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "reception"] });

    const contactId = body.id || body.contactId || body.contact_id;
    const rawPhone = body.phone_number || body.phoneNumber || body.phone;
    const normalizedLookupPhone = rawPhone ? normalizePhone(rawPhone) : null;

    if (!contactId && !normalizedLookupPhone) {
      throw new ApiError("Falta id o phone_number para identificar el contacto", 400);
    }

    const db = getD1();
    const current = contactId
      ? await db.prepare("SELECT id, phone_number, name, email, address, notes FROM contacts WHERE id = ? AND business_id = ?")
          .bind(contactId, businessId).first<{ id: string; phone_number: string; name: string; email: string | null; address: string | null; notes: string | null }>()
      : await db.prepare("SELECT id, phone_number, name, email, address, notes FROM contacts WHERE phone_number = ? AND business_id = ?")
          .bind(normalizedLookupPhone, businessId).first<{ id: string; phone_number: string; name: string; email: string | null; address: string | null; notes: string | null }>();

    if (!current) throw new ApiError("Contacto no encontrado", 404);

    const targetPhone = normalizedLookupPhone || current.phone_number;
    const rawName = body.name ?? body.customerName ?? body.customer_name;
    const name = rawName !== undefined && rawName.trim() ? rawName.trim() : current.name;
    const rawAddress = body.address ?? body.direccion;
    const address = rawAddress !== undefined ? (rawAddress.trim() || null) : current.address;
    const rawNotes = body.notes ?? body.notas;
    const notes = rawNotes !== undefined ? (rawNotes.trim() || null) : current.notes;
    const email = body.email !== undefined ? (body.email.trim() || null) : current.email;

    const now = Date.now();
    await db.batch([
      db.prepare("UPDATE contacts SET phone_number = ?, name = ?, email = ?, address = ?, notes = ?, updated_at = ? WHERE id = ? AND business_id = ?")
        .bind(targetPhone, name, email, address, notes, now, current.id, businessId),
      db.prepare("UPDATE chats SET user_name = ?, phone_number = ?, updated_at = ? WHERE business_id = ? AND phone_number = ?")
        .bind(name, targetPhone, now, businessId, current.phone_number),
      db.prepare("UPDATE messages SET phone_number = ? WHERE business_id = ? AND phone_number = ?")
        .bind(targetPhone, businessId, current.phone_number),
    ]);
    return NextResponse.json({ success: true, contact: { id: current.id, phone_number: targetPhone, name, address, notes, email } });
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
