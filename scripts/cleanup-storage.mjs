#!/usr/bin/env node
/**
 * Script autónomo para limpiar imágenes y comprobantes viejos de Supabase Storage.
 *
 * Uso:
 *   node scripts/cleanup-storage.mjs
 *   node scripts/cleanup-storage.mjs --days=7
 *   node scripts/cleanup-storage.mjs --days=3 --dry-run
 *   npm run clean:storage
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// Cargar variables de entorno desde .env.local o .env si existen
function loadEnvFile(filename) {
  const fullPath = resolve(rootDir, filename);
  if (!existsSync(fullPath)) return;
  const content = readFileSync(fullPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

// Parsear argumentos de línea de comandos
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith(`--${name}=`)) return args[i].split("=")[1];
    if (args[i] === `--${name}` && args[i + 1]) return args[i + 1];
  }
  return defaultValue;
}

const isDryRun = args.includes("--dry-run");
const days = Math.max(1, parseInt(getArg("days", "7"), 10) || 7);
const batchSize = Math.max(10, parseInt(getArg("batch", "100"), 10) || 100);

const supabaseUrl = getArg("url", process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = getArg("key", process.env.SUPABASE_SECRET_KEY);
const databaseUrl = getArg("db", process.env.DATABASE_URL);
const bucketName = getArg("bucket", process.env.SUPABASE_STORAGE_BUCKET || "conversation-media");

console.log("\n=======================================================");
console.log("   🧹 LIMPIEZA DE ALMACENAMIENTO - KROKANTICAS / SUPABASE");
console.log("=======================================================");
console.log(`- Período de retención: ${days} días (se borran archivos más viejos)`);
console.log(`- Bucket objetivo:     ${bucketName}`);
console.log(`- Modo de simulación:   ${isDryRun ? "SÍ (--dry-run, no se borrará nada)" : "NO (eliminación definitiva)"}`);

if (!supabaseUrl || !supabaseKey) {
  console.error("\n❌ Error: Faltan credenciales de Supabase.");
  console.error("Asegurate de tener configurado NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en tu archivo .env o .env.local.");
  console.error("\nTambién podés pasarlas directamente como argumentos:");
  console.error("  node scripts/cleanup-storage.mjs --url=https://xyz.supabase.co --key=tu_service_role_key --days=7\n");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
const cutoffDate = new Date(cutoffTime);
console.log(`- Fecha de corte:       ${cutoffDate.toISOString()} (${days} días atrás)`);

async function run() {
  let dbCleanedCount = 0;
  let storageCleanedCount = 0;
  let estimatedBytesFreed = 0;

  // 1. Limpieza a través de la base de datos (si DATABASE_URL está configurada)
  if (databaseUrl) {
    console.log("\n📦 Paso 1: Buscando mensajes multimedia en PostgreSQL...");
    let sql;
    try {
      sql = postgres(databaseUrl, { max: 1 });
      const oldMessages = await sql`
        SELECT id, storage_path, created_at, content_type
        FROM messages
        WHERE created_at <= ${cutoffTime}
          AND type = 'image'
          AND media_deleted = 0
          AND storage_path IS NOT NULL
        ORDER BY created_at ASC
        LIMIT 10000
      `;

      console.log(`  Encontrados ${oldMessages.length} mensajes con archivos vencidos.`);

      if (oldMessages.length > 0) {
        const paths = Array.from(new Set(oldMessages.map((m) => m.storage_path).filter(Boolean)));
        console.log(`  Archivos únicos a eliminar de Storage: ${paths.length}`);

        if (!isDryRun) {
          for (let i = 0; i < paths.length; i += batchSize) {
            const chunk = paths.slice(i, i + batchSize);
            const { data, error } = await supabase.storage.from(bucketName).remove(chunk);
            if (error) {
              console.warn(`  ⚠️ Error borrando lote de Storage: ${error.message}`);
            } else {
              dbCleanedCount += chunk.length;
            }
          }

          // Marcar como eliminados en la base de datos
          const ids = oldMessages.map((m) => m.id);
          const now = Date.now();
          await sql`
            UPDATE messages
            SET media_deleted = 1, media_deleted_at = ${now}
            WHERE id IN ${sql(ids)}
          `;
          console.log(`  ✅ ${dbCleanedCount} registros actualizados en la base de datos.`);
        } else {
          console.log(`  [Simulación] Se habrían eliminado ${paths.length} archivos y actualizado la BD.`);
        }
      }
    } catch (dbErr) {
      console.warn(`  ⚠️ No se pudo conectar a la BD directamente (${dbErr.message}). Continuando con escaneo de Storage...`);
    } finally {
      if (sql) await sql.end();
    }
  }

  // 2. Escaneo recursivo directo del bucket de Storage para archivos huérfanos o no registrados
  console.log("\n🗄️  Paso 2: Escaneando bucket de Supabase Storage...");
  try {
    const filesToDelete = [];

    async function scanFolder(prefix = "") {
      const { data, error } = await supabase.storage.from(bucketName).list(prefix, {
        limit: 1000,
        sortBy: { column: "created_at", order: "asc" },
      });

      if (error) {
        console.warn(`  ⚠️ Error listando carpeta "${prefix}": ${error.message}`);
        return;
      }

      for (const item of data || []) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null || !item.metadata) {
          // Es un subdirectorio / prefijo
          await scanFolder(itemPath);
        } else {
          // Es un archivo
          const createdAt = item.created_at ? new Date(item.created_at).getTime() : null;
          const updatedAt = item.updated_at ? new Date(item.updated_at).getTime() : null;
          const fileTime = createdAt || updatedAt;
          const isImage = itemPath.includes("/images/") || /\.(jpg|jpeg|png|webp|heic|gif)$/i.test(item.name);

          if (isImage && fileTime && fileTime <= cutoffTime) {
            filesToDelete.push({
              path: itemPath,
              size: item.metadata?.size || 0,
            });
            estimatedBytesFreed += (item.metadata?.size || 0);
          }
        }
      }
    }

    await scanFolder("");
    console.log(`  Encontrados ${filesToDelete.length} archivos en Storage anteriores a ${days} días.`);

    if (filesToDelete.length > 0) {
      const mb = (estimatedBytesFreed / (1024 * 1024)).toFixed(2);
      console.log(`  Espacio total a liberar: ~${mb} MB`);

      if (!isDryRun) {
        for (let i = 0; i < filesToDelete.length; i += batchSize) {
          const chunk = filesToDelete.slice(i, i + batchSize).map((f) => f.path);
          const { error } = await supabase.storage.from(bucketName).remove(chunk);
          if (error) {
            console.warn(`  ⚠️ Error al borrar lote: ${error.message}`);
          } else {
            storageCleanedCount += chunk.length;
            process.stdout.write(`\r  Progreso: ${storageCleanedCount}/${filesToDelete.length} archivos eliminados...`);
          }
        }
        console.log("\n  ✅ Eliminación de Storage completada.");
      } else {
        console.log(`  [Simulación] Se habrían borrado ${filesToDelete.length} archivos (~${mb} MB).`);
      }
    }
  } catch (storageErr) {
    console.error(`  ❌ Error durante el escaneo de Storage: ${storageErr.message}`);
  }

  console.log("\n=======================================================");
  console.log("   🎉 RESUMEN DE LIMPIEZA");
  console.log("=======================================================");
  const totalCleaned = Math.max(dbCleanedCount, storageCleanedCount);
  console.log(`- Total de archivos eliminados: ${isDryRun ? 0 : totalCleaned}`);
  if (estimatedBytesFreed > 0) {
    console.log(`- Espacio aproximado liberado:   ~${(estimatedBytesFreed / (1024 * 1024)).toFixed(2)} MB`);
  }
  console.log("- Tu plan gratuito de Supabase ahora tiene espacio disponible!");
  console.log("=======================================================\n");
}

run().catch((err) => {
  console.error("Error fatal en el script:", err);
  process.exit(1);
});
