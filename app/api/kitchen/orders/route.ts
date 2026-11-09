import { NextResponse } from "next/server";
import { apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { DEFAULT_ORDER_WINDOW_DAYS, listKitchenOrders, type OrderRange } from "@/lib/server/kitchen-store";

const DAY_MS = 24 * 60 * 60 * 1000;

function timestampParam(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// Qué pedidos devolver:
//   from / to (ms)  → pedidos creados en ese rango (el panel pide así el mes que se está mirando)
//   days=all        → todo el historial
//   days=N          → los últimos N días
//   status=active   → todos los pedidos sin entregar ni cancelar, sin límite de fecha (son pocos)
//   sin parámetros  → los últimos 2 días (lo que usan los flujos de n8n)
function rangeFrom(url: URL, status: string | null): OrderRange {
  const from = timestampParam(url.searchParams.get("from"));
  const to = timestampParam(url.searchParams.get("to"));
  if (from !== undefined || to !== undefined) return { from, to };

  const rawDays = url.searchParams.get("days");
  if (rawDays === "all") return "all";
  const days = rawDays === null ? NaN : Number(rawDays);
  if (Number.isFinite(days) && days > 0) return { from: Date.now() - days * DAY_MS };
  if (status === "active") return "all";
  return { from: Date.now() - DEFAULT_ORDER_WINDOW_DAYS * DAY_MS };
}

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    return NextResponse.json({ orders: await listKitchenOrders(businessId, status, rangeFrom(url, status)) });
  } catch (error) { return apiErrorResponse(error, "Error consultando comandas"); }
}
