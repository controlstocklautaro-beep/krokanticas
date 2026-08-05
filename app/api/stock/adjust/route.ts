import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; productId?: string; delta?: number; action?: "sum" | "subtract"; amount?: number };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "staff"] });
    if (!body.productId) throw new ApiError("Falta productId", 400);
    const delta = body.delta === undefined ? (body.action === "subtract" ? -1 : 1) * Math.max(1, Math.floor(Number(body.amount ?? 1))) : Math.trunc(Number(body.delta));
    if (!Number.isFinite(delta) || delta === 0) throw new ApiError("Ajuste inválido", 400);
    const current = await getD1().prepare("SELECT stock_status, stock_quantity FROM products WHERE id = ? AND business_id = ? AND active = 1").bind(body.productId, businessId).first<{ stock_status: string; stock_quantity: number | null }>();
    if (!current) throw new ApiError("Variedad no encontrada", 404);
    const base = current.stock_status === "limited" ? Number(current.stock_quantity ?? 0) : 0;
    const quantity = base + delta;
    if (quantity < 0) throw new ApiError("Stock insuficiente", 409);
    const status = quantity === 0 ? "soldout" : "limited";
    await getD1().prepare("UPDATE products SET stock_status = ?, stock_quantity = ?, updated_at = ? WHERE id = ? AND business_id = ?").bind(status, quantity, Date.now(), body.productId, businessId).run();
    return NextResponse.json({ success: true, stockStatus: status, stockQuantity: quantity });
  } catch (error) { return apiErrorResponse(error, "Error ajustando stock"); }
}
