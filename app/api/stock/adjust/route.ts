import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export async function POST(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const businessId = businessIdFrom(req, String(body.businessId || body.business_id || ""));
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "staff"] });
    
    const productId = String(body.productId || body.product_id || body.id || "").trim();
    const productName = String(body.name || body.productName || body.product_name || body.variedad || "").trim();
    
    const db = getD1();
    let current: { id: string; name: string; stock_status: string; stock_quantity: number | null } | null = null;
    if (productId) {
      current = await db.prepare("SELECT id, name, stock_status, stock_quantity FROM products WHERE id = ? AND business_id = ? AND active = 1").bind(productId, businessId).first();
    } else if (productName) {
      current = await db.prepare("SELECT id, name, stock_status, stock_quantity FROM products WHERE LOWER(name) = LOWER(?) AND business_id = ? AND active = 1").bind(productName, businessId).first();
    }
    
    if (!current) throw new ApiError("Variedad no encontrada (especificá productId o name)", 404);
    
    // Si mandan cantidad directa fijada (ej. stock: 10)
    if (body.quantity !== undefined || body.stock !== undefined || body.stockQuantity !== undefined || body.stock_quantity !== undefined) {
      const fixedQty = Math.max(0, Math.floor(Number(body.quantity ?? body.stock ?? body.stockQuantity ?? body.stock_quantity ?? 0)));
      const rawStatus = String(body.status || body.stockStatus || body.stock_status || (fixedQty === 0 ? "soldout" : "limited"));
      const status = rawStatus === "available" ? "available" : fixedQty === 0 ? "soldout" : "limited";
      const quantity = status === "available" ? null : fixedQty;
      await db.prepare("UPDATE products SET stock_status = ?, stock_quantity = ?, updated_at = ? WHERE id = ? AND business_id = ?").bind(status, quantity, Date.now(), current.id, businessId).run();
      return NextResponse.json({ success: true, id: current.id, name: current.name, stockStatus: status, stockQuantity: quantity });
    }

    const delta = body.delta === undefined 
      ? (body.action === "subtract" ? -1 : 1) * Math.max(1, Math.floor(Number(body.amount ?? 1))) 
      : Math.trunc(Number(body.delta));
      
    if (!Number.isFinite(delta) || delta === 0) throw new ApiError("Ajuste (delta) inválido", 400);
    
    const base = current.stock_status === "limited" ? Number(current.stock_quantity ?? 0) : 0;
    const quantity = base + delta;
    if (quantity < 0) throw new ApiError("Stock insuficiente", 409);
    const status = quantity === 0 ? "soldout" : "limited";
    
    await db.prepare("UPDATE products SET stock_status = ?, stock_quantity = ?, updated_at = ? WHERE id = ? AND business_id = ?").bind(status, quantity, Date.now(), current.id, businessId).run();
    return NextResponse.json({ success: true, id: current.id, name: current.name, stockStatus: status, stockQuantity: quantity });
  } catch (error) { return apiErrorResponse(error, "Error ajustando stock"); }
}
