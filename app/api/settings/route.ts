import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const db = getD1();
    let settings = await db.prepare("SELECT store_open, delay_minutes, courier_active, updated_at FROM business_settings WHERE business_id = ?").bind(businessId).first();
    if (!settings) {
      await db.prepare("INSERT INTO business_settings (business_id, store_open, delay_minutes, courier_active, updated_at) VALUES (?, 1, 30, 1, ?)").bind(businessId, Date.now()).run();
      settings = { store_open: 1, delay_minutes: 30, courier_active: 1, updated_at: Date.now() };
    }
    return NextResponse.json({ settings });
  } catch (error) { return apiErrorResponse(error, "Error consultando configuración"); }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; storeOpen?: boolean; delayMinutes?: number; courierActive?: boolean };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "staff"] });
    const delay = body.delayMinutes === undefined ? null : Number(body.delayMinutes);
    if (delay !== null && ![15, 30, 45].includes(delay)) throw new ApiError("La demora debe ser 15, 30 o 45", 400);
    const db = getD1(); const now = Date.now();
    await db.prepare(`INSERT INTO business_settings (business_id, store_open, delay_minutes, courier_active, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(business_id) DO UPDATE SET store_open = COALESCE(?, store_open), delay_minutes = COALESCE(?, delay_minutes), courier_active = COALESCE(?, courier_active), updated_at = ?`)
      .bind(businessId, body.storeOpen === false ? 0 : 1, delay ?? 30, body.courierActive === false ? 0 : 1, now, body.storeOpen === undefined ? null : body.storeOpen ? 1 : 0, delay, body.courierActive === undefined ? null : body.courierActive ? 1 : 0, now).run();
    return NextResponse.json({ success: true });
  } catch (error) { return apiErrorResponse(error, "Error actualizando configuración"); }
}
