import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { activeBusinessCookie, createSession, hashPassword, normalizeEmail, sessionCookie, validatePassword } from "@/lib/server/app-auth";
import { ApiError, apiErrorResponse } from "@/lib/server/api-utils";

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = await req.json() as { name?: string; email?: string; password?: string; setupToken?: string };
    const expectedSetupToken = process.env.INITIAL_ADMIN_SETUP_TOKEN;
    if (process.env.NODE_ENV === "production" && (!expectedSetupToken || body.setupToken !== expectedSetupToken)) {
      throw new ApiError("La clave de configuración inicial no es válida", 403);
    }
    const count = await getD1().prepare("SELECT COUNT(*) AS total FROM app_users").first<{ total: number }>();
    if (Number(count?.total ?? 0) > 0) throw new ApiError("El administrador inicial ya fue creado", 409);
    const name = body.name?.trim();
    if (!name || name.length < 2 || name.length > 100) throw new ApiError("Ingresá el nombre del responsable", 400);
    const email = normalizeEmail(body.email);
    const passwordHash = await hashPassword(validatePassword(body.password));
    const userId = crypto.randomUUID();
    const now = Date.now();
    const businessId = process.env.INITIAL_BUSINESS_ID?.trim() || "krokanticas";
    const businessName = process.env.INITIAL_BUSINESS_NAME?.trim() || "Krokanticas";
    const db = getD1();
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO businesses (id, name, business_type, plan, created_at) VALUES (?, ?, 'restaurant', 'pro', ?)").bind(businessId, businessName, now),
      db.prepare("INSERT INTO app_users (id, email, name, password_hash, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?)")
        .bind(userId, email, name, passwordHash, now, now),
      db.prepare("INSERT INTO memberships (business_id, user_id, email, role, active, created_at) VALUES (?, ?, ?, 'owner', 1, ?)")
        .bind(businessId, userId, email, now),
      ...["messages", "contacts", "settings", "users", "stock", "kitchen", "handoffs"].map((module) =>
        db.prepare("INSERT OR IGNORE INTO business_modules (business_id, module, enabled, updated_at) VALUES (?, ?, 1, ?)")
          .bind(businessId, module, now)),
    ]);
    const session = await createSession(userId);
    const response = NextResponse.json({ success: true, user: { id: userId, email, name, role: "owner" } }, { status: 201 });
    response.headers.append("Set-Cookie", sessionCookie(session.token, session.expiresAt));
    response.headers.append("Set-Cookie", activeBusinessCookie(businessId));
    return response;
  } catch (error) {
    return apiErrorResponse(error, "Error creando administrador inicial");
  }
}
