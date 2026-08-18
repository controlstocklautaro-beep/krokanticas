import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { activeBusinessCookie, getAppUserFromRequest } from "@/lib/server/app-auth";
import { ApiError, apiErrorResponse, normalizeBusinessId } from "@/lib/server/api-utils";

export async function GET(req: Request) {
  try {
    const user = await getAppUserFromRequest(req, null);
    if (!user) throw new ApiError("Sesión vencida. Volvé a iniciar sesión", 401);
    const businesses = await getD1().prepare(`
      SELECT b.id, b.name, b.business_type, b.plan, m.role,
        COALESCE(string_agg(bm.module, ',' ORDER BY bm.module) FILTER (WHERE bm.enabled = 1), '') AS modules
      FROM memberships m
      JOIN businesses b ON b.id = m.business_id
      LEFT JOIN business_modules bm ON bm.business_id = b.id
      WHERE m.user_id = ? AND m.active = 1
      GROUP BY b.id, b.name, b.business_type, b.plan, m.role, m.created_at
      ORDER BY m.created_at ASC
    `).bind(user.id).all<Record<string, unknown>>();
    return NextResponse.json({
      activeBusinessId: user.businessId,
      businesses: businesses.results.map((business) => ({
        id: String(business.id),
        name: String(business.name),
        businessType: String(business.business_type),
        plan: String(business.plan),
        role: String(business.role),
        modules: String(business.modules || "").split(",").filter(Boolean),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error, "Error listando empresas");
  }
}

export async function POST(req: Request) {
  try {
    const current = await getAppUserFromRequest(req, null);
    if (!current) throw new ApiError("Sesión vencida. Volvé a iniciar sesión", 401);
    const body = await req.json() as { businessId?: string };
    const businessId = normalizeBusinessId(body.businessId);
    const membership = await getD1().prepare("SELECT active FROM memberships WHERE user_id = ? AND business_id = ?")
      .bind(current.id, businessId).first<{ active: number }>();
    if (!membership || !Number(membership.active)) throw new ApiError("No tenés acceso a esa empresa", 403);
    const response = NextResponse.json({ success: true, businessId });
    response.headers.set("Set-Cookie", activeBusinessCookie(businessId));
    return response;
  } catch (error) {
    return apiErrorResponse(error, "Error cambiando de empresa");
  }
}
