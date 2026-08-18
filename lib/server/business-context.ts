import { getD1 } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { AppRole, getAppUserFromRequest } from "./app-auth";
import { ApiError, normalizeBusinessId } from "./api-utils";

export type BusinessRole = AppRole;
export type BusinessContext = { businessId: string; userId: string | null; role: BusinessRole | "integration" };
type AccessOptions = { allowIntegration?: boolean; roles?: BusinessRole[] };

function moduleForPath(pathname: string): string | null {
  if (pathname.startsWith("/api/stock")) return "stock";
  if (pathname.startsWith("/api/kitchen")) return "kitchen";
  if (pathname.startsWith("/api/handoffs")) return "handoffs";
  if (pathname.startsWith("/api/contacts")) return "contacts";
  if (pathname.startsWith("/api/users")) return "users";
  if (pathname.startsWith("/api/settings")) return "settings";
  if (pathname.startsWith("/api/pipeline")) return "pipeline";
  if (pathname.startsWith("/api/finances")) return "finances";
  if (pathname.startsWith("/api/metrics")) return "metrics";
  if (/^\/api\/(chats|messages|tags|assign-tags|remove-tags|send-message|ingest-message|bot-status|toggle-bot|delete-chat|delete-all-chats|upload-image|upload-media|media|cleanup-expired-media)/.test(pathname)) return "messages";
  return null;
}

function bearerToken(req: Request): string | null {
  const authorization = req.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim();
  return req.headers.get("x-business-key");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validIntegrationKey(req: Request, storedHash: string | null): Promise<boolean> {
  const supplied = bearerToken(req);
  if (!supplied) return false;
  const globalKey = process.env.BUSINESS_INTEGRATION_KEY;
  const expectedHash = storedHash ?? (globalKey ? await sha256(globalKey) : null);
  return Boolean(expectedHash && (await sha256(supplied)) === expectedHash);
}

export async function requireBusinessAccess(
  req: Request,
  rawBusinessId: unknown,
  options: AccessOptions = {},
): Promise<BusinessContext> {
  const businessId = normalizeBusinessId(rawBusinessId);
  await ensureSchema();
  const db = getD1();
  const now = Date.now();
  const appUser = await getAppUserFromRequest(req, businessId);
  if (appUser) {
    if (appUser.mustChangePassword) throw new ApiError("Debés actualizar tu contraseña antes de continuar", 403);
    if (options.roles && !options.roles.includes(appUser.role)) {
      throw new ApiError("Tu rol no permite realizar esta acción", 403);
    }
    return { businessId, userId: appUser.id, role: appUser.role };
  }
  const allowPlatformFallback = process.env.ALLOW_PLATFORM_AUTH_FALLBACK === "true";
  const userId = allowPlatformFallback ? req.headers.get("oai-authenticated-user-id") :
    (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_AUTH_BYPASS === "true" ? req.headers.get("x-dev-user-id") : null);
  const email = allowPlatformFallback ? req.headers.get("oai-authenticated-user-email") : null;

  let business = await db.prepare("SELECT id, integration_key_hash FROM businesses WHERE id = ?")
    .bind(businessId).first<{ id: string; integration_key_hash: string | null }>();

  if (!business && userId) {
    await db.prepare("INSERT OR IGNORE INTO businesses (id, name, business_type, plan, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(
        businessId,
        businessId === "krokanticas" ? "Krokanticas" : businessId === "casa-oliva" ? "Casa Oliva" : businessId === "nexo-estudio" ? "Nexo Estudio" : businessId,
        businessId === "krokanticas" || businessId === "casa-oliva" ? "restaurant" : "services",
        businessId === "krokanticas" || businessId === "casa-oliva" ? "pro" : "base",
        now,
      ).run();
    business = { id: businessId, integration_key_hash: null };
  }
  if (!business) throw new ApiError("Empresa no encontrada", 404);

  const requestedModule = moduleForPath(new URL(req.url).pathname);
  if (requestedModule) {
    const moduleState = await db.prepare(`SELECT
      COUNT(*) AS configured,
      SUM(CASE WHEN module = ? AND enabled = 1 THEN 1 ELSE 0 END) AS allowed
      FROM business_modules WHERE business_id = ?`).bind(requestedModule, businessId).first<{ configured: number; allowed: number | null }>();
    if (Number(moduleState?.configured ?? 0) > 0 && Number(moduleState?.allowed ?? 0) === 0) {
      throw new ApiError("Este módulo no está habilitado para la empresa", 403);
    }
  }

  if (userId) {
    let membership = await db.prepare("SELECT role, active FROM memberships WHERE business_id = ? AND user_id = ?")
      .bind(businessId, userId).first<{ role: BusinessRole; active: number }>();
    if (!membership) {
      const count = await db.prepare("SELECT COUNT(*) AS total FROM memberships WHERE business_id = ?")
        .bind(businessId).first<{ total: number }>();
      if (Number(count?.total ?? 0) === 0) {
        await db.prepare("INSERT INTO memberships (business_id, user_id, email, role, active, created_at) VALUES (?, ?, ?, 'owner', 1, ?)")
          .bind(businessId, userId, email, now).run();
        membership = { role: "owner", active: 1 };
      }
    }
    if (!membership?.active) throw new ApiError("No tenés acceso a esta empresa", 403);
    if (options.roles && !options.roles.includes(membership.role)) {
      throw new ApiError("Tu rol no permite realizar esta acción", 403);
    }
    return { businessId, userId, role: membership.role };
  }

  if (options.allowIntegration && await validIntegrationKey(req, business.integration_key_hash)) {
    return { businessId, userId: null, role: "integration" };
  }
  throw new ApiError("No autorizado", 401);
}
