import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

type LeadRow = {
  id: string; column_id: string; contact_id: string | null; client_name: string; subject: string;
  amount: number; currency: string; email: string | null; phone: string | null; notes: string | null;
  priority: string; created_at: number; updated_at: number;
};

function serializeLead(row: LeadRow) {
  return {
    id: row.id, columnId: row.column_id, contactId: row.contact_id, clientName: row.client_name,
    subject: row.subject, property: row.subject, amount: row.amount, currency: row.currency,
    email: row.email, phone: row.phone, notes: row.notes, priority: row.priority,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function assertColumn(businessId: string, columnId: string) {
  const column = await getD1().prepare("SELECT id FROM pipeline_columns WHERE id = ? AND business_id = ?")
    .bind(columnId, businessId).first();
  if (!column) throw new ApiError("Columna no encontrada", 404);
}

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId);
    const result = await getD1().prepare("SELECT * FROM pipeline_leads WHERE business_id = ? ORDER BY created_at DESC")
      .bind(businessId).all<LeadRow>();
    return NextResponse.json({ leads: result.results.map(serializeLead) });
  } catch (error) {
    return apiErrorResponse(error, "Error listando leads");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin", "manager", "reception"] });
    const columnId = typeof body.columnId === "string" ? body.columnId : "";
    const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
    if (!columnId || !clientName) throw new ApiError("Faltan columnId o clientName", 400);
    await assertColumn(businessId, columnId);
    const id = crypto.randomUUID();
    const now = Date.now();
    const subject = typeof body.subject === "string" ? body.subject.trim() : typeof body.property === "string" ? body.property.trim() : "";
    const currency = body.currency === "USD" ? "USD" : "ARS";
    const priority = ["alta", "media", "baja"].includes(String(body.priority)) ? String(body.priority) : "media";
    await getD1().prepare(`
      INSERT INTO pipeline_leads (id, business_id, column_id, contact_id, client_name, subject, amount, currency, email, phone, notes, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, businessId, columnId, body.contactId || null, clientName, subject, Number(body.amount) || 0, currency,
      body.email || null, body.phone || null, body.notes || null, priority, now, now).run();
    const row = await getD1().prepare("SELECT * FROM pipeline_leads WHERE id = ?").bind(id).first<LeadRow>();
    return NextResponse.json({ success: true, lead: row ? serializeLead(row) : null }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Error creando lead");
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin", "manager", "reception"] });
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) throw new ApiError("Falta id", 400);
    const current = await getD1().prepare("SELECT * FROM pipeline_leads WHERE id = ? AND business_id = ?")
      .bind(id, businessId).first<LeadRow>();
    if (!current) throw new ApiError("Lead no encontrado", 404);
    const columnId = typeof body.columnId === "string" ? body.columnId : current.column_id;
    await assertColumn(businessId, columnId);
    await getD1().prepare(`
      UPDATE pipeline_leads SET column_id = ?, contact_id = ?, client_name = ?, subject = ?, amount = ?, currency = ?,
        email = ?, phone = ?, notes = ?, priority = ?, updated_at = ? WHERE id = ? AND business_id = ?
    `).bind(
      columnId, body.contactId ?? current.contact_id, typeof body.clientName === "string" ? body.clientName.trim() : current.client_name,
      typeof body.subject === "string" ? body.subject.trim() : typeof body.property === "string" ? body.property.trim() : current.subject,
      body.amount === undefined ? current.amount : Number(body.amount) || 0, body.currency === "USD" ? "USD" : body.currency === "ARS" ? "ARS" : current.currency,
      body.email ?? current.email, body.phone ?? current.phone, body.notes ?? current.notes,
      ["alta", "media", "baja"].includes(String(body.priority)) ? String(body.priority) : current.priority,
      Date.now(), id, businessId,
    ).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Error actualizando lead");
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; id?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin", "manager"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    await getD1().prepare("DELETE FROM pipeline_leads WHERE id = ? AND business_id = ?").bind(body.id, businessId).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Error eliminando lead");
  }
}
