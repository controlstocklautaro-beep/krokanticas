import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { activeBusinessCookie, createSession, hashPassword, normalizeEmail, sessionCookie, verifyPassword } from "@/lib/server/app-auth";
import { ApiError, apiErrorResponse } from "@/lib/server/api-utils";

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = await req.json() as { email?: string; password?: string };
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const row = await getD1().prepare(`
      SELECT u.id, u.email, u.name, u.password_hash, u.active, u.must_change_password, m.role,
        m.active AS membership_active, m.business_id, b.name AS business_name
      FROM app_users u JOIN memberships m ON m.user_id = u.id
      JOIN businesses b ON b.id = m.business_id
      WHERE u.email = ?
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.created_at ASC
      LIMIT 1
    `).bind(email).first<Record<string, unknown>>();
    const passwordHash = row ? String(row.password_hash ?? "") : await hashPassword("Acceso inválido 0000");
    if (!await verifyPassword(password, passwordHash) || !row) {
      throw new ApiError("Correo o contraseña incorrectos", 401);
    }
    if (!Number(row.active) || !Number(row.membership_active)) throw new ApiError("Este usuario está desactivado", 403);
    const now = Date.now();
    await getD1().prepare("UPDATE app_users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, row.id).run();
    const session = await createSession(String(row.id));
    const response = NextResponse.json({
      success: true,
      user: { id: row.id, email: row.email, name: row.name, role: row.role, mustChangePassword: Boolean(row.must_change_password) },
    });
    response.headers.append("Set-Cookie", sessionCookie(session.token, session.expiresAt));
    response.headers.append("Set-Cookie", activeBusinessCookie(String(row.business_id)));
    return response;
  } catch (error) {
    return apiErrorResponse(error, "Error iniciando sesión");
  }
}
