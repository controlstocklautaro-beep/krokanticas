import { NextResponse } from "next/server";
import { apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { createKitchenOrder } from "@/lib/server/kitchen-store";

export async function POST(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "reception", "staff"] });
    return NextResponse.json({ success: true, order: await createKitchenOrder(businessId, body) }, { status: 201 });
  } catch (error) { return apiErrorResponse(error, "Error creando comanda"); }
}
