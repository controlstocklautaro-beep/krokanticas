import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { createSession, hashPassword, normalizeEmail, sessionCookie, validatePassword } from "@/lib/server/app-auth";
import { ApiError, apiErrorResponse } from "@/lib/server/api-utils";

export async function POST(req: Request) {
  try {
    await ensureSchema();
    if (process.env.NODE_ENV === "production" && !req.headers.get("oai-authenticated-user-id")) {
      throw new ApiError("El alta inicial requiere el acceso privado del sitio", 403);
    }
    const count = await getD1().prepare("SELECT COUNT(*) AS total FROM app_users").first<{ total: number }>();
    if (Number(count?.total ?? 0) > 0) throw new ApiError("El administrador inicial ya fue creado", 409);
    const body = await req.json() as { name?: string; email?: string; password?: string };
    const name = body.name?.trim();
    if (!name || name.length < 2 || name.length > 100) throw new ApiError("Ingresá el nombre del responsable", 400);
    const email = normalizeEmail(body.email);
    const passwordHash = await hashPassword(validatePassword(body.password));
    const userId = crypto.randomUUID();
    const now = Date.now();
    const db = getD1();
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO businesses (id, name, business_type, plan, created_at) VALUES ('krokanticas', 'Krokanticas', 'restaurant', 'pro', ?)").bind(now),
      db.prepare("INSERT INTO app_users (id, email, name, password_hash, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?)")
        .bind(userId, email, name, passwordHash, now, now),
      db.prepare("INSERT INTO memberships (business_id, user_id, email, role, active, created_at) VALUES ('krokanticas', ?, ?, 'owner', 1, ?)")
        .bind(userId, email, now),
    ]);
    const session = await createSession(userId);
    const response = NextResponse.json({ success: true, user: { id: userId, email, name, role: "owner" } }, { status: 201 });
    response.headers.set("Set-Cookie", sessionCookie(session.token, session.expiresAt));
    return response;
  } catch (error) {
    return apiErrorResponse(error, "Error creando administrador inicial");
  }
}
