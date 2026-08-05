import { NextResponse } from "next/server";
import { getD1, getMediaBucket } from "@/db";
import { apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export const dynamic = "force-dynamic";

const MEDIA_RETENTION_DAYS = 90;
const MAX_ITEMS_PER_RUN = 2_000;

function hasCleanupSecret(req: Request) {
  const secret = process.env.MEDIA_CLEANUP_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawBusinessId = req.headers.get("x-business-id") ?? url.searchParams.get("businessId");
    const globalRun = hasCleanupSecret(req) && !rawBusinessId;
    let businessId: string | null = null;
    if (!globalRun) {
      businessId = businessIdFrom(req);
      if (!hasCleanupSecret(req)) {
        await requireBusinessAccess(req, businessId, { roles: ["owner", "admin"] });
      }
    }

    const cutoff = Date.now() - MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const db = getD1();
    const query = businessId
      ? db.prepare(`SELECT id, storage_path FROM messages WHERE business_id = ? AND created_at <= ? AND type IN ('image', 'audio') AND media_deleted = 0 AND storage_path IS NOT NULL ORDER BY created_at ASC LIMIT ?`).bind(businessId, cutoff, MAX_ITEMS_PER_RUN)
      : db.prepare(`SELECT id, storage_path FROM messages WHERE created_at <= ? AND type IN ('image', 'audio') AND media_deleted = 0 AND storage_path IS NOT NULL ORDER BY created_at ASC LIMIT ?`).bind(cutoff, MAX_ITEMS_PER_RUN);
    const records = await query.all<{ id: string; storage_path: string }>();
    const bucket = getMediaBucket();
    let cleaned = 0;
    let missingFiles = 0;
    const updates: D1PreparedStatement[] = [];
    for (const record of records.results) {
      const existing = await bucket.head(record.storage_path);
      if (existing) {
        await bucket.delete(record.storage_path);
        cleaned++;
      } else {
        missingFiles++;
      }
      updates.push(db.prepare("UPDATE messages SET media_deleted = 1, media_deleted_at = ? WHERE id = ?")
        .bind(Date.now(), record.id));
    }
    if (updates.length) await db.batch(updates);
    return NextResponse.json({
      success: true,
      retention_days: MEDIA_RETENTION_DAYS,
      cutoff_date: new Date(cutoff).toISOString(),
      scanned: records.results.length,
      cleaned,
      missing_files: missingFiles,
      skipped: 0,
      businessId: businessId ?? "all",
    });
  } catch (error) {
    return apiErrorResponse(error, "Error limpiando multimedia vencida");
  }
}
