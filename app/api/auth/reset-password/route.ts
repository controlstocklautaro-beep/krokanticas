import { consumeResetToken, hashPassword, validatePassword } from "@/lib/server/app-auth";
import { ApiError, apiErrorResponse, noStoreJson } from "@/lib/server/api-utils";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { token?: string; password?: string };
    const token = body.token?.trim();
    if (!token || token.length < 20) throw new ApiError("El enlace de recuperación no es válido", 400);
    const passwordHash = await hashPassword(validatePassword(body.password));
    const userId = await consumeResetToken(token, passwordHash);
    if (!userId) throw new ApiError("El enlace venció o ya fue utilizado", 400);
    return noStoreJson({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Error restableciendo contraseña");
  }
}
