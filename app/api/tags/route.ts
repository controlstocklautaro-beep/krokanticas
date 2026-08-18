import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId);
    const result = await getD1().prepare("SELECT id, name, color FROM tags WHERE business_id = ? ORDER BY name ASC")
      .bind(businessId).all();
    return NextResponse.json({ tags: result.results });
  } catch (error) {
    return apiErrorResponse(error, "Error listando etiquetas");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; name?: string; color?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin", "manager"] });
    const name = body.name?.trim();
    if (!name) throw new ApiError("Falta name", 400);
    const color = /^#[0-9a-f]{6}$/i.test(body.color ?? "") ? body.color! : "#ed6a2c";
    const id = crypto.randomUUID();
    const now = Date.now();
    await getD1().prepare("INSERT INTO tags (id, business_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, businessId, name, color, now, now).run();
    return NextResponse.json({ success: true, tag: { id, name, color } }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Error creando etiqueta");
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; id?: string; name?: string; color?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin", "manager"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    const current = await getD1().prepare("SELECT name, color FROM tags WHERE id = ? AND business_id = ?")
      .bind(body.id, businessId).first<{ name: string; color: string }>();
    if (!current) throw new ApiError("Etiqueta no encontrada", 404);
    const name = body.name?.trim() || current.name;
    const color = /^#[0-9a-f]{6}$/i.test(body.color ?? "") ? body.color! : current.color;
    const db = getD1();
    await db.batch([
      db.prepare("UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ? AND business_id = ?")
        .bind(name, color, Date.now(), body.id, businessId),
      db.prepare(`DELETE FROM chat_tags old_tag WHERE old_tag.business_id = ? AND old_tag.tag = ? AND EXISTS (
        SELECT 1 FROM chat_tags new_tag WHERE new_tag.business_id = old_tag.business_id
        AND new_tag.phone_number = old_tag.phone_number AND new_tag.tag = ?
      )`).bind(businessId, current.name, name),
      db.prepare("UPDATE chat_tags SET tag = ? WHERE business_id = ? AND tag = ?")
        .bind(name, businessId, current.name),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Error actualizando etiqueta");
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; id?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    const current = await getD1().prepare("SELECT name FROM tags WHERE id = ? AND business_id = ?")
      .bind(body.id, businessId).first<{ name: string }>();
    if (!current) throw new ApiError("Etiqueta no encontrada", 404);
    const db = getD1();
    await db.batch([
      db.prepare("DELETE FROM chat_tags WHERE business_id = ? AND tag = ?").bind(businessId, current.name),
      db.prepare("DELETE FROM tags WHERE id = ? AND business_id = ?").bind(body.id, businessId),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Error eliminando etiqueta");
  }
}
