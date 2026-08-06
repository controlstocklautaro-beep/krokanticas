import { NextResponse } from "next/server";
import { createSession, getAppUserFromRequest, hashPassword, sessionCookie, validatePassword } from "@/lib/server/app-auth";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse } from "@/lib/server/api-utils";

export async function POST(req: Request) {
  try {
    const user = await getAppUserFromRequest(req);
    if (!user) throw new ApiError("Sesión vencida. Volvé a iniciar sesión", 401);
    const body = await req.json() as { password?: string };
    const passwordHash = await hashPassword(validatePassword(body.password));
    const now = Date.now();
    const db = getD1();
    await db.batch([
      db.prepare("UPDATE app_users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?").bind(passwordHash, now, user.id),
      db.prepare("DELETE FROM app_sessions WHERE user_id = ?").bind(user.id),
    ]);
    const session = await createSession(user.id);
    const response = NextResponse.json({ success: true });
    response.headers.set("Set-Cookie", sessionCookie(session.token, session.expiresAt));
    return response;
  } catch (error) {
    return apiErrorResponse(error, "Error cambiando contraseña");
  }
}
