import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

const reasons = ["complaint", "ambiguity", "human_request", "post_confirmation_change", "other"];
const statuses = ["open", "in_progress", "resolved"];
const priorities = ["low", "medium", "high"];

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const status = new URL(req.url).searchParams.get("status");
    const sql = `SELECT id, contact_id, order_id, phone_number, customer_name, reason, summary, priority, status, assigned_to, created_at, updated_at, resolved_at FROM handoffs WHERE business_id = ?${status && status !== "all" ? " AND status = ?" : ""} ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`;
    const result = status && status !== "all" ? await getD1().prepare(sql).bind(businessId, status).all() : await getD1().prepare(sql).bind(businessId).all();
    return NextResponse.json({ handoffs: result.results });
  } catch (error) { return apiErrorResponse(error, "Error consultando derivaciones"); }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; contactId?: string; orderId?: string; phoneNumber?: string; customerName?: string; reason?: string; summary?: string; priority?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "reception", "staff"] });
    let customerName = body.customerName?.trim(); let phoneNumber = body.phoneNumber?.trim() || null;
    if (body.contactId) {
      const contact = await getD1().prepare("SELECT name, phone_number FROM contacts WHERE id = ? AND business_id = ?").bind(body.contactId, businessId).first<{ name: string; phone_number: string }>();
      if (!contact) throw new ApiError("Contacto no encontrado", 404);
      customerName = customerName || contact.name; phoneNumber = phoneNumber || contact.phone_number;
    }
    if (body.orderId) {
      const order = await getD1().prepare("SELECT customer_name, phone_number FROM orders WHERE id = ? AND business_id = ?").bind(body.orderId, businessId).first<{ customer_name: string; phone_number: string }>();
      if (!order) throw new ApiError("Comanda no encontrada", 404);
      customerName = customerName || order.customer_name; phoneNumber = phoneNumber || order.phone_number;
    }
    const summary = body.summary?.trim();
    if (!customerName || !summary) throw new ApiError("Faltan customerName o summary", 400);
    const id = crypto.randomUUID(); const now = Date.now();
    await getD1().prepare("INSERT INTO handoffs (id, business_id, contact_id, order_id, phone_number, customer_name, reason, summary, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)")
      .bind(id, businessId, body.contactId || null, body.orderId || null, phoneNumber, customerName, reasons.includes(body.reason || "") ? body.reason : "other", summary, priorities.includes(body.priority || "") ? body.priority : "medium", now, now).run();
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) { return apiErrorResponse(error, "Error creando derivación"); }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; id?: string; status?: string; priority?: string; assignedTo?: string; summary?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "reception", "staff"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    const current = await getD1().prepare("SELECT status, priority, assigned_to, summary FROM handoffs WHERE id = ? AND business_id = ?").bind(body.id, businessId).first<{ status: string; priority: string; assigned_to: string | null; summary: string }>();
    if (!current) throw new ApiError("Derivación no encontrada", 404);
    const status = statuses.includes(body.status || "") ? body.status! : current.status;
    const priority = priorities.includes(body.priority || "") ? body.priority! : current.priority;
    const now = Date.now();
    await getD1().prepare("UPDATE handoffs SET status = ?, priority = ?, assigned_to = ?, summary = ?, updated_at = ?, resolved_at = ? WHERE id = ? AND business_id = ?")
      .bind(status, priority, body.assignedTo === undefined ? current.assigned_to : body.assignedTo.trim() || null, body.summary?.trim() || current.summary, now, status === "resolved" ? now : null, body.id, businessId).run();
    return NextResponse.json({ success: true });
  } catch (error) { return apiErrorResponse(error, "Error actualizando derivación"); }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; id?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    await getD1().prepare("DELETE FROM handoffs WHERE id = ? AND business_id = ?").bind(body.id, businessId).run();
    return NextResponse.json({ success: true });
  } catch (error) { return apiErrorResponse(error, "Error eliminando derivación"); }
}
