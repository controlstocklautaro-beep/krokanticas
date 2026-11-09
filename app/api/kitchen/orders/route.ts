import { NextResponse } from "next/server";
import { apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { DEFAULT_ORDER_WINDOW_DAYS, listKitchenOrders } from "@/lib/server/kitchen-store";

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    // days=N limita a los últimos N días (2 por defecto); days=all devuelve el historial completo.
    const rawDays = url.searchParams.get("days");
    const parsedDays = rawDays === null ? NaN : Number(rawDays);
    const days = rawDays === "all" ? "all" : Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : DEFAULT_ORDER_WINDOW_DAYS;
    return NextResponse.json({ orders: await listKitchenOrders(businessId, status, days) });
  } catch (error) { return apiErrorResponse(error, "Error consultando comandas"); }
}
