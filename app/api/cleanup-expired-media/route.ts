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
  const bucket = getMediaBucket();
  const now = Date.now();

  // 1. Escaneo directo y borrado en Supabase Storage (elimina todas las imágenes viejas aunque no estén en messages)
  let storageCleaned = 0;
  try {
    const storageResult = await bucket.scanAndCleanExpiredImages(cutoff, maxItems);
    storageCleaned = storageResult.cleaned;
  } catch (storageError) {
    console.warn("Error en escaneo directo de storage:", storageError);
  }

  // 2. Limpiar registros de mensajes multimedia en base de datos
  let dbMessagesCount = 0;
  try {
    const query = businessId
      ? db.prepare(`
          SELECT id, storage_path FROM messages
          WHERE business_id = ? AND created_at <= ? AND (type = 'image' OR storage_path IS NOT NULL) AND media_deleted = 0
          ORDER BY created_at ASC LIMIT ?
        `).bind(businessId, cutoff, maxItems)
      : db.prepare(`
          SELECT id, storage_path FROM messages
          WHERE created_at <= ? AND (type = 'image' OR storage_path IS NOT NULL) AND media_deleted = 0
          ORDER BY created_at ASC LIMIT ?
        `).bind(cutoff, maxItems);

    const records = await query.all<{ id: string; storage_path: string | null }>();
    dbMessagesCount = records.results.length;

    if (records.results.length > 0) {
      // Si hay storage_paths específicos que no se borraron en el escaneo
      const pathsToDelete = Array.from(new Set(records.results.map((r) => r.storage_path).filter(Boolean))) as string[];
      for (let i = 0; i < pathsToDelete.length; i += BATCH_DELETE_CHUNK_SIZE) {
        const chunk = pathsToDelete.slice(i, i + BATCH_DELETE_CHUNK_SIZE);
        try {
          await bucket.deleteMany(chunk);
          storageCleaned += chunk.length;
        } catch {
          // Ya pudieron haber sido borrados en el escaneo
        }
      }

      // Marcar registros en la base de datos como media_deleted = 1
      const batchSize = 100;
      for (let i = 0; i < records.results.length; i += batchSize) {
        const chunk = records.results.slice(i, i + batchSize);
        const updates: PreparedStatement[] = chunk.map((record) =>
          db.prepare("UPDATE messages SET media_deleted = 1, media_deleted_at = ? WHERE id = ?").bind(now, record.id)
        );
        await db.batch(updates);
      }
    }
  } catch (dbError) {
    console.warn("Error actualizando mensajes en BD:", dbError);
  }

  // 3. Limpiar URLs de comprobantes en comandas viejas (para no dejar links caídos, preservando el pedido)
  let dbOrdersCount = 0;
  try {
    const ordersQuery = businessId
      ? db.prepare(`SELECT id, receipt_url FROM orders WHERE business_id = ? AND created_at <= ? AND receipt_url IS NOT NULL LIMIT ?`).bind(businessId, cutoff, maxItems)
      : db.prepare(`SELECT id, receipt_url FROM orders WHERE created_at <= ? AND receipt_url IS NOT NULL LIMIT ?`).bind(cutoff, maxItems);

    const expiredOrders = await ordersQuery.all<{ id: string; receipt_url: string }>();
    dbOrdersCount = expiredOrders.results.length;

    if (expiredOrders.results.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < expiredOrders.results.length; i += batchSize) {
        const chunk = expiredOrders.results.slice(i, i + batchSize);
        const updates: PreparedStatement[] = chunk.map((order) =>
          db.prepare("UPDATE orders SET receipt_url = NULL, updated_at = ? WHERE id = ?").bind(now, order.id)
        );
        await db.batch(updates);
      }
    }
  } catch (ordersError) {
    console.warn("Error limpiando URLs de comandas:", ordersError);
  }

  const totalCleaned = Math.max(storageCleaned, dbMessagesCount, dbOrdersCount);

  return NextResponse.json({
    success: true,
    retention_days: retentionDays,
    cutoff_date: new Date(cutoff).toISOString(),
    scanned: totalCleaned,
    cleaned: totalCleaned,
    storage_cleaned: storageCleaned,
    messages_cleaned: dbMessagesCount,
    orders_cleaned: dbOrdersCount,
    businessId: businessId ?? "all",
    message: totalCleaned > 0
      ? `Se eliminaron ${totalCleaned} imágenes de comprobantes con más de ${retentionDays} días de antigüedad en Supabase Storage. Los mensajes de texto, chats y pedidos permanecen intactos.`
      : `No se encontraron imágenes con más de ${retentionDays} días de antigüedad. El almacenamiento de Supabase ya está al día.`,
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
