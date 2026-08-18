import { getD1 } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { getAppUserFromRequest } from "@/lib/server/app-auth";
import { apiErrorResponse, noStoreJson } from "@/lib/server/api-utils";

export async function GET(req: Request) {
  try {
    await ensureSchema();
    const count = await getD1().prepare("SELECT COUNT(*) AS total FROM app_users").first<{ total: number }>();
    const user = await getAppUserFromRequest(req);
    const needsSetup = Number(count?.total ?? 0) === 0;
    return noStoreJson({
      authenticated: Boolean(user),
      user,
      needsSetup,
      setupAllowed: needsSetup && (process.env.NODE_ENV !== "production" || Boolean(process.env.INITIAL_ADMIN_SETUP_TOKEN)),
    });
  } catch (error) {
    return apiErrorResponse(error, "Error consultando autenticación");
  }
}
