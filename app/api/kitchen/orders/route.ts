import { NextResponse } from "next/server";
import { apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { listKitchenOrders } from "@/lib/server/kitchen-store";

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const status = new URL(req.url).searchParams.get("status");
    return NextResponse.json({ orders: await listKitchenOrders(businessId, status) });
  } catch (error) { return apiErrorResponse(error, "Error consultando comandas"); }
}
