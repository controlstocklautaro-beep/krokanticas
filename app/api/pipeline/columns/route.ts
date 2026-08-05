import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

const DEFAULT_COLUMNS = [
  ["Nuevo lead", "#5477ef"],
  ["Contactado", "#e4a140"],
  ["Reunión", "#ed6a2c"],
  ["Propuesta", "#8a60d0"],
  ["Cerrado", "#35a47b"],
];

async function listColumns(businessId: string) {
  const result = await getD1().prepare("SELECT id, name, color, position FROM pipeline_columns WHERE business_id = ? ORDER BY position ASC")
    .bind(businessId).all<{ id: string; name: string; color: string; position: number }>();
  return result.results;
}

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId);
    let columns = await listColumns(businessId);
    if (!columns.length) {
      const db = getD1();
      const now = Date.now();
      await db.batch(DEFAULT_COLUMNS.map(([name, color], position) => db.prepare(
        "INSERT INTO pipeline_columns (id, business_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), businessId, name, color, position, now)));
      columns = await listColumns(businessId);
    }
    return NextResponse.json({ columns });
  } catch (error) {
    return apiErrorResponse(error, "Error listando columnas del pipeline");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; name?: string; color?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin", "manager"] });
    const name = body.name?.trim();
    if (!name) throw new ApiError("Falta el nombre de la columna", 400);
    const color = /^#[0-9a-f]{6}$/i.test(body.color ?? "") ? body.color! : "#5477ef";
    const db = getD1();
    const count = await db.prepare("SELECT COUNT(*) AS total FROM pipeline_columns WHERE business_id = ?")
      .bind(businessId).first<{ total: number }>();
    const column = { id: crypto.randomUUID(), name, color, position: Number(count?.total ?? 0) };
    await db.prepare("INSERT INTO pipeline_columns (id, business_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(column.id, businessId, column.name, column.color, column.position, Date.now()).run();
    return NextResponse.json({ success: true, column }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Error creando columna del pipeline");
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; id?: string; name?: string; color?: string; position?: number };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin", "manager"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    const current = await getD1().prepare("SELECT name, color, position FROM pipeline_columns WHERE id = ? AND business_id = ?")
      .bind(body.id, businessId).first<{ name: string; color: string; position: number }>();
    if (!current) throw new ApiError("Columna no encontrada", 404);
    const name = body.name?.trim() || current.name;
    const color = /^#[0-9a-f]{6}$/i.test(body.color ?? "") ? body.color! : current.color;
    const position = Number.isInteger(body.position) ? body.position! : current.position;
    await getD1().prepare("UPDATE pipeline_columns SET name = ?, color = ?, position = ? WHERE id = ? AND business_id = ?")
      .bind(name, color, position, body.id, businessId).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Error actualizando columna del pipeline");
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; id?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    const db = getD1();
    await db.batch([
      db.prepare("DELETE FROM pipeline_leads WHERE business_id = ? AND column_id = ?").bind(businessId, body.id),
      db.prepare("DELETE FROM pipeline_columns WHERE business_id = ? AND id = ?").bind(businessId, body.id),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Error eliminando columna del pipeline");
  }
}
