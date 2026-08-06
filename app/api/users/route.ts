import { getD1 } from "@/db";
import { AppRole, hashPassword, normalizeEmail, requireAppUser, validatePassword } from "@/lib/server/app-auth";
import { ApiError, apiErrorResponse, businessIdFrom, noStoreJson } from "@/lib/server/api-utils";

const roles: AppRole[] = ["owner", "admin", "manager", "reception", "cashier", "staff"];

function roleFrom(value: unknown): AppRole {
  if (typeof value !== "string" || !roles.includes(value as AppRole)) throw new ApiError("Rol inválido", 400);
  return value as AppRole;
}

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireAppUser(req, businessId, ["owner", "admin"]);
    const result = await getD1().prepare(`
      SELECT u.id, u.name, u.email, u.active, u.must_change_password, u.last_login_at, u.created_at, m.role, m.active AS membership_active
      FROM app_users u JOIN memberships m ON m.user_id = u.id
      WHERE m.business_id = ? ORDER BY u.name ASC
    `).bind(businessId).all<Record<string, unknown>>();
    return noStoreJson({ users: result.results.map((user) => ({
      ...user,
      active: Boolean(user.active) && Boolean(user.membership_active),
      must_change_password: Boolean(user.must_change_password),
    })) });
  } catch (error) {
    return apiErrorResponse(error, "Error listando usuarios");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; name?: string; email?: string; role?: string; password?: string };
    const businessId = businessIdFrom(req, body.businessId);
    const actor = await requireAppUser(req, businessId, ["owner", "admin"]);
    const name = body.name?.trim();
    if (!name || name.length < 2 || name.length > 100) throw new ApiError("Ingresá el nombre del usuario", 400);
    const email = normalizeEmail(body.email);
    const role = roleFrom(body.role ?? "staff");
    if (actor.role !== "owner" && role === "owner") throw new ApiError("Solo el propietario puede crear otro propietario", 403);
    const passwordHash = await hashPassword(validatePassword(body.password));
    const existing = await getD1().prepare("SELECT id FROM app_users WHERE email = ?").bind(email).first();
    if (existing) throw new ApiError("Ya existe un usuario con ese correo", 409);
    const id = crypto.randomUUID();
    const now = Date.now();
    const db = getD1();
    await db.batch([
      db.prepare("INSERT INTO app_users (id, email, name, password_hash, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?)")
        .bind(id, email, name, passwordHash, now, now),
      db.prepare("INSERT INTO memberships (business_id, user_id, email, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)")
        .bind(businessId, id, email, role, now),
    ]);
    return noStoreJson({ success: true, id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Error creando usuario");
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { businessId?: string; id?: string; name?: string; role?: string; active?: boolean; password?: string };
    const businessId = businessIdFrom(req, body.businessId);
    const actor = await requireAppUser(req, businessId, ["owner", "admin"]);
    if (!body.id) throw new ApiError("Falta el usuario", 400);
    const current = await getD1().prepare(`
      SELECT u.id, u.name, u.active, m.role FROM app_users u JOIN memberships m ON m.user_id = u.id
      WHERE u.id = ? AND m.business_id = ?
    `).bind(body.id, businessId).first<{ id: string; name: string; active: number; role: AppRole }>();
    if (!current) throw new ApiError("Usuario no encontrado", 404);
    const nextRole = body.role ? roleFrom(body.role) : current.role;
    const nextActive = typeof body.active === "boolean" ? body.active : Boolean(current.active);
    if (actor.role !== "owner" && (current.role === "owner" || nextRole === "owner")) {
      throw new ApiError("Solo el propietario puede modificar propietarios", 403);
    }
    if (actor.id === body.id && !nextActive) throw new ApiError("No podés desactivar tu propio usuario", 400);
    if (current.role === "owner" && (nextRole !== "owner" || !nextActive)) {
      const owners = await getD1().prepare(`
        SELECT COUNT(*) AS total FROM memberships m JOIN app_users u ON u.id = m.user_id
        WHERE m.business_id = ? AND m.role = 'owner' AND m.active = 1 AND u.active = 1
      `).bind(businessId).first<{ total: number }>();
      if (Number(owners?.total ?? 0) <= 1) throw new ApiError("Debe quedar al menos un propietario activo", 400);
    }
    const name = body.name?.trim() || current.name;
    if (name.length > 100) throw new ApiError("El nombre es demasiado largo", 400);
    const db = getD1();
    const statements = [
      db.prepare("UPDATE app_users SET name = ?, active = ?, updated_at = ? WHERE id = ?").bind(name, nextActive ? 1 : 0, Date.now(), body.id),
      db.prepare("UPDATE memberships SET role = ?, active = ? WHERE business_id = ? AND user_id = ?").bind(nextRole, nextActive ? 1 : 0, businessId, body.id),
    ];
    if (body.password) {
      statements.push(db.prepare("UPDATE app_users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?")
        .bind(await hashPassword(validatePassword(body.password)), Date.now(), body.id));
      statements.push(db.prepare("DELETE FROM app_sessions WHERE user_id = ?").bind(body.id));
    } else if (!nextActive) {
      statements.push(db.prepare("DELETE FROM app_sessions WHERE user_id = ?").bind(body.id));
    }
    await db.batch(statements);
    return noStoreJson({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Error actualizando usuario");
  }
}
