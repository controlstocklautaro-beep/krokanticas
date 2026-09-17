import { NextResponse } from "next/server";
import { getD1, getMediaBucket, type PreparedStatement } from "@/db";
import { apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export const dynamic = "force-dynamic";

const DEFAULT_MEDIA_RETENTION_DAYS = 7; // Conservar los últimos 7 días de comprobantes e imágenes
const DEFAULT_MAX_ITEMS_PER_RUN = 5_000;
const BATCH_DELETE_CHUNK_SIZE = 100;

function hasCleanupSecret(req: Request) {
  const secret = process.env.MEDIA_CLEANUP_SECRET;
  const authHeader = req.headers.get("authorization");
  if (secret && authHeader === `Bearer ${secret}`) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return false;
}

async function runCleanup(req: Request) {
  const url = new URL(req.url);
  const rawBusinessId = req.headers.get("x-business-id") ?? url.searchParams.get("businessId");
  const isGlobalSecret = hasCleanupSecret(req);
  const globalRun = isGlobalSecret && !rawBusinessId;

  let businessId: string | null = null;
  if (!globalRun) {
    businessId = businessIdFrom(req, rawBusinessId ?? undefined);
    if (!isGlobalSecret) {
      await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin"] });
    }
  }

  // Soporte para configurar días y límite por query param (ej: ?days=7&limit=2000)
  const daysParam = url.searchParams.get("days") ?? url.searchParams.get("dias");
  const retentionDays = daysParam ? Math.max(1, parseInt(daysParam, 10) || DEFAULT_MEDIA_RETENTION_DAYS) : DEFAULT_MEDIA_RETENTION_DAYS;

  const limitParam = url.searchParams.get("limit") ?? url.searchParams.get("limite");
  const maxItems = limitParam ? Math.min(10_000, Math.max(10, parseInt(limitParam, 10) || DEFAULT_MAX_ITEMS_PER_RUN)) : DEFAULT_MAX_ITEMS_PER_RUN;

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const db = getD1();

  const query = businessId
    ? db.prepare(`
        SELECT id, storage_path FROM messages
        WHERE business_id = ? AND created_at <= ? AND type = 'image' AND media_deleted = 0 AND storage_path IS NOT NULL
        ORDER BY created_at ASC LIMIT ?
      `).bind(businessId, cutoff, maxItems)
    : db.prepare(`
        SELECT id, storage_path FROM messages
        WHERE created_at <= ? AND type = 'image' AND media_deleted = 0 AND storage_path IS NOT NULL
        ORDER BY created_at ASC LIMIT ?
      `).bind(cutoff, maxItems);

  const records = await query.all<{ id: string; storage_path: string }>();

  if (!records.results.length) {
    return NextResponse.json({
      success: true,
      retention_days: retentionDays,
      cutoff_date: new Date(cutoff).toISOString(),
      scanned: 0,
      cleaned: 0,
      businessId: businessId ?? "all",
      message: `No hay imágenes de comprobantes con más de ${retentionDays} días para eliminar.`,
    });
  }

  const bucket = getMediaBucket();
  const pathsToDelete = Array.from(new Set(records.results.map((r) => r.storage_path).filter(Boolean)));
  let cleaned = 0;

  // Eliminación masiva por lotes en Supabase Storage (100 archivos por llamada en vez de 1 a 1)
  for (let i = 0; i < pathsToDelete.length; i += BATCH_DELETE_CHUNK_SIZE) {
    const chunk = pathsToDelete.slice(i, i + BATCH_DELETE_CHUNK_SIZE);
    try {
      await bucket.deleteMany(chunk);
      cleaned += chunk.length;
    } catch {
      // Si falla un bloque masivo, intentamos de a uno para no detener el resto
      for (const singlePath of chunk) {
        try {
          await bucket.delete(singlePath);
          cleaned++;
        } catch {
          // Ignorar archivo si ya no existía
        }
      }
    }
  }

  // Actualizar registros en base de datos marcando media_deleted = 1
  const now = Date.now();
  const batchSize = 100;
  for (let i = 0; i < records.results.length; i += batchSize) {
    const chunk = records.results.slice(i, i + batchSize);
    const updates: PreparedStatement[] = chunk.map((record) =>
      db.prepare("UPDATE messages SET media_deleted = 1, media_deleted_at = ? WHERE id = ?").bind(now, record.id)
    );
    await db.batch(updates);
  }

  return NextResponse.json({
    success: true,
    retention_days: retentionDays,
    cutoff_date: new Date(cutoff).toISOString(),
    scanned: records.results.length,
    cleaned,
    businessId: businessId ?? "all",
    message: `Se eliminaron ${cleaned} imágenes de comprobantes con más de ${retentionDays} días de antigüedad en Supabase Storage. Los mensajes de texto e historial permanecen intactos.`,
  });
}

export async function GET(req: Request) {
  try {
    return await runCleanup(req);
  } catch (error) {
    return apiErrorResponse(error, "Error limpiando multimedia vencida");
  }
}

export async function POST(req: Request) {
  try {
    return await runCleanup(req);
  } catch (error) {
    return apiErrorResponse(error, "Error limpiando multimedia vencida");
  }
}
