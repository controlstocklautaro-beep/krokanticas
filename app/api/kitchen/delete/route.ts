import { NextResponse } from "next/server";
import { ApiError, apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { deleteKitchenOrder } from "@/lib/server/kitchen-store";

async function remove(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; id?: string };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    return NextResponse.json({ success: true, order: await deleteKitchenOrder(businessId, body.id) });
  } catch (error) { return apiErrorResponse(error, "Error eliminando comanda"); }
}
export const DELETE = remove;
export const POST = remove;
