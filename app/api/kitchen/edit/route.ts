import { NextResponse } from "next/server";
import { apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";
import { editKitchenOrder } from "@/lib/server/kitchen-store";

async function edit(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "reception", "staff"] });
    return NextResponse.json({ success: true, order: await editKitchenOrder(businessId, body) });
  } catch (error) { return apiErrorResponse(error, "Error editando comanda"); }
}
export const PATCH = edit;
export const POST = edit;
