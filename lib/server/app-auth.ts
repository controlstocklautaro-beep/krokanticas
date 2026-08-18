import { getD1 } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { ApiError } from "./api-utils";

export const SESSION_COOKIE = "krokanticas_session";
export const ACTIVE_BUSINESS_COOKIE = "nexo_business";
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const RESET_DURATION_MS = 30 * 60 * 1000;
const PASSWORD_ITERATIONS = 180_000;

export type AppRole = "owner" | "admin" | "manager" | "reception" | "cashier" | "staff";
export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  active: boolean;
  mustChangePassword: boolean;
  businessId: string;
  businessName: string;
  modules: string[];
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = new ArrayBuffer(salt.length);
  new Uint8Array(saltBuffer).set(salt);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations }, key, 256);
  return new Uint8Array(bits);
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new ApiError("Ingresá un correo válido", 400);
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) {
    throw new ApiError("Ingresá un correo válido", 400);
  }
  return email;
}

export function validatePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 10 || value.length > 128 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(value) || !/\d/.test(value)) {
    throw new ApiError("La contraseña debe tener entre 10 y 128 caracteres, al menos una letra y un número", 400);
  }
  return value;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(derived)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationValue, saltValue, hashValue] = encoded.split("$");
  if (algorithm !== "pbkdf2-sha256" || !iterationValue || !saltValue || !hashValue) return false;
  const iterations = Number(iterationValue);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
  try {
    const actual = await derivePassword(password, base64UrlToBytes(saltValue), iterations);
    const expected = base64UrlToBytes(hashValue);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}

export function sessionTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

export function activeBusinessIdFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === ACTIVE_BUSINESS_COOKIE) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

export async function getAppUserBySessionToken(token: string | null, businessId?: string | null): Promise<AppUser | null> {
  if (!token) return null;
  await ensureSchema();
  const tokenHash = await sha256(token);
  const row = await getD1().prepare(`
    SELECT u.id, u.email, u.name, u.active, u.must_change_password, m.role, m.active AS membership_active,
      m.business_id, b.name AS business_name
    FROM app_sessions s
    JOIN app_users u ON u.id = s.user_id
    JOIN memberships m ON m.user_id = u.id
    JOIN businesses b ON b.id = m.business_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND (CAST(? AS TEXT) IS NULL OR m.business_id = ?)
    ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.created_at ASC
    LIMIT 1
  `).bind(tokenHash, Date.now(), businessId ?? null, businessId ?? null).first<Record<string, unknown>>();
  if (!row || !Number(row.active) || !Number(row.membership_active)) return null;
  const modules = await getD1().prepare("SELECT module FROM business_modules WHERE business_id = ? AND enabled = 1 ORDER BY module")
    .bind(String(row.business_id)).all<{ module: string }>();
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    role: String(row.role) as AppRole,
    active: true,
    mustChangePassword: Boolean(row.must_change_password),
    businessId: String(row.business_id),
    businessName: String(row.business_name),
    modules: modules.results.map((entry) => entry.module),
  };
}

export async function getAppUserFromRequest(req: Request, businessId?: string | null): Promise<AppUser | null> {
  const cookieHeader = req.headers.get("cookie");
  return getAppUserBySessionToken(
    sessionTokenFromCookieHeader(cookieHeader),
    businessId === undefined ? activeBusinessIdFromCookieHeader(cookieHeader) : businessId,
  );
}

export async function requireAppUser(req: Request, businessId?: string | null, roles?: AppRole[]): Promise<AppUser> {
  const user = await getAppUserFromRequest(req, businessId);
  if (!user) throw new ApiError("Sesión vencida. Volvé a iniciar sesión", 401);
  if (user.mustChangePassword) throw new ApiError("Debés actualizar tu contraseña antes de continuar", 403);
  if (roles && !roles.includes(user.role)) throw new ApiError("Tu rol no permite realizar esta acción", 403);
  return user;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: number }> {
  await ensureSchema();
  const token = randomToken();
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const db = getD1();
  await db.batch([
    db.prepare("DELETE FROM app_sessions WHERE expires_at <= ?").bind(Date.now()),
    db.prepare("INSERT INTO app_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, await sha256(token), expiresAt, Date.now()),
  ]);
  return { token, expiresAt };
}

export async function destroySession(token: string | null): Promise<void> {
  if (!token) return;
  await ensureSchema();
  await getD1().prepare("DELETE FROM app_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export function sessionCookie(token: string, expiresAt: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure}`;
}

export function clearedSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function activeBusinessCookie(businessId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ACTIVE_BUSINESS_COOKIE}=${encodeURIComponent(businessId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${secure}`;
}

export async function createResetToken(userId: string): Promise<{ token: string; expiresAt: number }> {
  await ensureSchema();
  const token = randomToken();
  const expiresAt = Date.now() + RESET_DURATION_MS;
  const db = getD1();
  await db.batch([
    db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").bind(Date.now(), userId),
    db.prepare("INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)")
      .bind(crypto.randomUUID(), userId, await sha256(token), expiresAt, Date.now()),
  ]);
  return { token, expiresAt };
}

export async function consumeResetToken(token: string, newPasswordHash: string): Promise<string | null> {
  await ensureSchema();
  const now = Date.now();
  const tokenHash = await sha256(token);
  const row = await getD1().prepare(`
    SELECT r.id, r.user_id FROM password_reset_tokens r
    JOIN app_users u ON u.id = r.user_id
    WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ? AND u.active = 1
  `).bind(tokenHash, now).first<{ id: string; user_id: string }>();
  if (!row) return null;
  const db = getD1();
  const claimed = await db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, row.id).run();
  if (Number(claimed.meta.changes ?? claimed.meta.rows_written ?? 0) !== 1) return null;
  await db.batch([
    db.prepare("UPDATE app_users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?").bind(newPasswordHash, now, row.user_id),
    db.prepare("DELETE FROM app_sessions WHERE user_id = ?").bind(row.user_id),
  ]);
  return row.user_id;
}
