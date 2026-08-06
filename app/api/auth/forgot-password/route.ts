import { getD1 } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { createResetToken, normalizeEmail } from "@/lib/server/app-auth";
import { apiErrorResponse, noStoreJson } from "@/lib/server/api-utils";

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = await req.json() as { email?: string };
    const email = normalizeEmail(body.email);
    const user = await getD1().prepare("SELECT id, name, email FROM app_users WHERE email = ? AND active = 1")
      .bind(email).first<{ id: string; name: string; email: string }>();
    let developmentResetUrl: string | undefined;
    if (user) {
      const reset = await createResetToken(user.id);
      const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(reset.token)}`, req.url).toString();
      const webhookUrl = process.env.PASSWORD_RESET_WEBHOOK_URL;
      if (webhookUrl) {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (process.env.PASSWORD_RESET_WEBHOOK_SECRET) headers.Authorization = `Bearer ${process.env.PASSWORD_RESET_WEBHOOK_SECRET}`;
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ businessId: "krokanticas", email: user.email, name: user.name, resetUrl, expiresInMinutes: 30 }),
          });
        } catch (error) {
          console.error("No se pudo notificar la recuperación", error);
        }
      }
      if (process.env.NODE_ENV !== "production") developmentResetUrl = resetUrl;
    }
    return noStoreJson({
      success: true,
      message: "Si el correo está registrado, vas a recibir un enlace para restablecer la contraseña.",
      developmentResetUrl,
    });
  } catch (error) {
    return apiErrorResponse(error, "Error solicitando recuperación");
  }
}
