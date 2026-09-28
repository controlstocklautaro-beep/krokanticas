import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export function normalizePhone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiError("Falta phone_number", 400);
  let digits = value.trim().replace(/\D/g, "");
  if (!digits || digits.length < 6 || digits.length > 18) throw new ApiError("phone_number inválido", 400);

  // Normalización para teléfonos de Argentina para asegurar coincidencia con WhatsApp Cloud API (+549...):
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.startsWith("54") && !digits.startsWith("549") && digits.length === 12) {
    digits = `549${digits.slice(2)}`;
  } else if (digits.length === 10) {
    digits = `549${digits}`;
  } else if (digits.length === 12 && digits.startsWith("1115")) {
    digits = `54911${digits.slice(4)}`;
  }

  return `+${digits}`;
}

export function normalizeBusinessId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(value)) {
    throw new ApiError("businessId inválido o ausente", 400);
  }
  return value;
}

export function businessIdFrom(req: Request, explicit?: unknown): string {
  if (explicit) return normalizeBusinessId(explicit);
  const url = new URL(req.url);
  return normalizeBusinessId(req.headers.get("x-business-id") ?? url.searchParams.get("businessId"));
}

export function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  headers.set("Pragma", "no-cache");
  return NextResponse.json(body, { ...init, headers });
}

export function isApiError(error: unknown): error is ApiError {
  if (error instanceof ApiError) return true;
  return Boolean(
    error &&
      typeof error === "object" &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number" &&
      "message" in error,
  );
}

export function apiErrorResponse(error: unknown, label: string) {
  if (isApiError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(label, error);
  return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
}

export function stringArray(value: unknown, fieldName: string): string[] {
  const result = (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!result.length) throw new ApiError(`Falta '${fieldName}'`, 400);
  return [...new Set(result)].slice(0, 30);
}
