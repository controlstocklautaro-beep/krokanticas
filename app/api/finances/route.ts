import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

type TransactionRow = { id: string; type: string; concept: string; amount: number; currency: string; category: string; transaction_date: number; status: string; notes: string | null };
function serialize(row: TransactionRow) { return { ...row, date: row.transaction_date }; }

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId);
    const result = await getD1().prepare("SELECT id, type, concept, amount, currency, category, transaction_date, status, notes FROM transactions WHERE business_id = ? ORDER BY transaction_date DESC, created_at DESC")
      .bind(businessId).all<TransactionRow>();
    return NextResponse.json({ transactions: result.results.map(serialize) });
  } catch (error) {
    return apiErrorResponse(error, "Error listando finanzas");
  }
}

function parsedTransaction(body: Record<string, unknown>, current?: TransactionRow) {
  const type = body.type === "egreso" ? "egreso" : body.type === "ingreso" ? "ingreso" : current?.type;
  const concept = typeof body.concept === "string" ? body.concept.trim() : current?.concept;
  if (!type || !concept) throw new ApiError("Faltan type o concept", 400);
  const amount = body.amount === undefined ? current?.amount ?? 0 : Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new ApiError("Monto inválido", 400);
  const currency = body.currency === "USD" ? "USD" : body.currency === "ARS" ? "ARS" : current?.currency ?? "ARS";
  const status = body.status === "pendiente" ? "pendiente" : body.status === "pagado" ? "pagado" : current?.status ?? "pagado";
  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim().slice(0, 80) : current?.category ?? "Otros";
  const rawDate = body.date === undefined ? current?.transaction_date ?? Date.now() : new Date(String(body.date)).getTime();
  if (!Number.isFinite(rawDate)) throw new ApiError("Fecha inválida", 400);
  return { type, concept, amount, currency, category, status, date: rawDate, notes: typeof body.notes === "string" ? body.notes.trim() : current?.notes ?? null };
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin", "manager", "cashier"] });
    const tx = parsedTransaction(body);
    const id = crypto.randomUUID();
    const now = Date.now();
    await getD1().prepare(`INSERT INTO transactions (id, business_id, type, concept, amount, currency, category, transaction_date, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, businessId, tx.type, tx.concept, tx.amount, tx.currency, tx.category, tx.date, tx.status, tx.notes, now, now).run();
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Error creando movimiento financiero");
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin", "manager", "cashier"] });
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) throw new ApiError("Falta id", 400);
    const current = await getD1().prepare("SELECT id, type, concept, amount, currency, category, transaction_date, status, notes FROM transactions WHERE id = ? AND business_id = ?")
      .bind(id, businessId).first<TransactionRow>();
    if (!current) throw new ApiError("Movimiento no encontrado", 404);
    const tx = parsedTransaction(body, current);
    await getD1().prepare("UPDATE transactions SET type = ?, concept = ?, amount = ?, currency = ?, category = ?, transaction_date = ?, status = ?, notes = ?, updated_at = ? WHERE id = ? AND business_id = ?")
      .bind(tx.type, tx.concept, tx.amount, tx.currency, tx.category, tx.date, tx.status, tx.notes, Date.now(), id, businessId).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Error actualizando movimiento financiero");
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; id?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    await getD1().prepare("DELETE FROM transactions WHERE id = ? AND business_id = ?").bind(body.id, businessId).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Error eliminando movimiento financiero");
  }
}
