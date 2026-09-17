import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type QueryRow = Record<string, unknown>;
type QueryColumn = { name: string; type: number };
type QueryResult = QueryRow[] & { count?: number; columns?: QueryColumn[] };
type QueryExecutor = {
  unsafe(query: string, parameters?: unknown[]): Promise<QueryResult>;
};

function databaseUrl(): string {
  const value = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL)?.trim().replace(/^["']|["']$/g, "");
  if (!value) throw new Error("Falta DATABASE_URL. Conectá el proyecto de Supabase antes de usar la API.");
  return value;
}

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (!sqlClient) {
    sqlClient = postgres(databaseUrl(), {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
  }
  return sqlClient;
}

export function getDb() {
  return drizzle(getSql(), { schema });
}

function positionalParameters(source: string): string {
  let result = "";
  let position = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const previous = source[index - 1];
    if (character === "'" && !doubleQuoted && previous !== "\\") singleQuoted = !singleQuoted;
    if (character === '"' && !singleQuoted && previous !== "\\") doubleQuoted = !doubleQuoted;
    if (character === "?" && !singleQuoted && !doubleQuoted) {
      position += 1;
      result += `$${position}`;
    } else {
      result += character;
    }
  }
  return result;
}

function postgresSql(source: string): string {
  let query = source.trim().replace(/;$/, "");
  const ignoreConflict = /^INSERT\s+OR\s+IGNORE\s+INTO/i.test(query);
  query = query
    .replace(/^INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO")
    .replace(/^UPDATE\s+OR\s+IGNORE\s+/i, "UPDATE ")
    .replace(
      /GROUP_CONCAT\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi,
      "string_agg($1, $2)",
    )
    .replace(
      /strftime\('%Y-%m',\s*created_at\s*\/\s*1000,\s*'unixepoch'\)/gi,
      "to_char(to_timestamp(created_at / 1000.0), 'YYYY-MM')",
    );
  if (ignoreConflict) query += " ON CONFLICT DO NOTHING";
  return positionalParameters(query);
}

function normalizeRows(result: QueryResult): QueryRow[] {
  const bigintColumns = new Set((result.columns ?? []).filter((column) => column.type === 20).map((column) => column.name));
  return result.map((row) => {
    const normalized = { ...row };
    for (const column of bigintColumns) {
      const value = normalized[column];
      if (typeof value === "string" && /^-?\d+$/.test(value)) normalized[column] = Number(value);
      if (typeof value === "bigint") normalized[column] = Number(value);
    }
    return normalized;
  });
}

export class PreparedStatement {
  private readonly parameters: unknown[];

  constructor(private readonly query: string, parameters: unknown[] = []) {
    this.parameters = parameters;
  }

  bind(...parameters: unknown[]): PreparedStatement {
    return new PreparedStatement(this.query, parameters);
  }

  async execute(executor: QueryExecutor): Promise<{ rows: QueryRow[]; count: number }> {
    const result = await executor.unsafe(postgresSql(this.query), this.parameters);
    return { rows: normalizeRows(result), count: Number(result.count ?? 0) };
  }

  async first<T extends QueryRow = QueryRow>(): Promise<T | null> {
    const result = await this.execute(getSql() as unknown as QueryExecutor);
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T extends QueryRow = QueryRow>(): Promise<{ results: T[]; success: true; meta: { changes: number } }> {
    const result = await this.execute(getSql() as unknown as QueryExecutor);
    return { results: result.rows as T[], success: true, meta: { changes: result.count } };
  }

  async run(): Promise<{ success: true; meta: { changes: number; rows_written: number } }> {
    const result = await this.execute(getSql() as unknown as QueryExecutor);
    return { success: true, meta: { changes: result.count, rows_written: result.count } };
  }
}

class DatabaseClient {
  prepare(query: string): PreparedStatement {
    return new PreparedStatement(query);
  }

  async batch(statements: PreparedStatement[]) {
    return getSql().begin(async (transaction) => {
      const executor = transaction as unknown as QueryExecutor;
      const results = [];
      for (const statement of statements) results.push(await statement.execute(executor));
      return results;
    });
  }
}

const databaseClient = new DatabaseClient();

// Alias temporal para conservar los endpoints y helpers existentes mientras la
// aplicación pasa de D1 a PostgreSQL. Ya no utiliza Cloudflare D1.
export function getD1(): DatabaseClient {
  return databaseClient;
}

function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type MediaPutOptions = {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

class SupabaseMediaObject {
  constructor(readonly body: Blob) {}
  get httpEtag() { return `W/\"${this.body.size}-${this.body.type || "application/octet-stream"}\"`; }
  writeHttpMetadata(headers: Headers) {
    headers.set("Content-Type", this.body.type || "application/octet-stream");
    headers.set("Content-Length", String(this.body.size));
  }
}

class SupabaseMediaBucket {
  private get bucketName() { return process.env.SUPABASE_STORAGE_BUCKET ?? "conversation-media"; }
  private get bucket() { return supabaseAdmin().storage.from(this.bucketName); }

  async put(path: string, contents: ArrayBuffer, options: MediaPutOptions = {}) {
    let uploadFailed = false;
    let uploadErrorMessage = "";
    try {
      const { error } = await this.bucket.upload(path, new Uint8Array(contents), {
        contentType: options.httpMetadata?.contentType ?? "application/octet-stream",
        cacheControl: "3600",
        upsert: true,
      });
      if (error) {
        uploadFailed = true;
        uploadErrorMessage = error.message;
      }
    } catch (err: unknown) {
      uploadFailed = true;
      uploadErrorMessage = err instanceof Error ? err.message : String(err);
    }

    if (uploadFailed) {
      console.warn(`[Storage Fallback] Supabase Storage restringido (${uploadErrorMessage}). Guardando en PostgreSQL fallback: ${path}`);
      try {
        const sql = getSql();
        const buffer = Buffer.from(contents);
        const contentType = options.httpMetadata?.contentType ?? "image/jpeg";
        const now = Date.now();
        await sql`
          INSERT INTO storage_fallback (path, contents, content_type, created_at)
          VALUES (${path}, ${buffer}, ${contentType}, ${now})
          ON CONFLICT (path) DO UPDATE SET contents = EXCLUDED.contents, content_type = EXCLUDED.content_type, created_at = EXCLUDED.created_at
        `;
        return;
      } catch {
        throw new Error(`No se pudo guardar el archivo: ${uploadErrorMessage}`);
      }
    }
  }

  async get(path: string): Promise<SupabaseMediaObject | null> {
    try {
      const { data, error } = await this.bucket.download(path);
      if (!error && data) return new SupabaseMediaObject(data);
    } catch {
      // Continuar al fallback
    }

    // Buscar en storage_fallback de PostgreSQL
    try {
      const sql = getSql();
      const rows = await sql`
        SELECT contents, content_type FROM storage_fallback WHERE path = ${path} LIMIT 1
      `;
      if (rows && rows.length > 0) {
        const row = rows[0];
        const blob = new Blob([row.contents as any], { type: (row.content_type as string) || "application/octet-stream" });
        return new SupabaseMediaObject(blob);
      }
    } catch {}

    return null;
  }

  async signedUrl(path: string, expiresIn = 60 * 60): Promise<string> {
    try {
      const { data, error } = await this.bucket.createSignedUrl(path, expiresIn);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch {
      // Continuar al fallback
    }
    const baseUrl = process.env.APP_BASE_URL || "";
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return `${baseUrl}/api/media/${encoded}`;
  }

  async head(path: string): Promise<{ key: string } | null> {
    try {
      const separator = path.lastIndexOf("/");
      const folder = separator >= 0 ? path.slice(0, separator) : "";
      const filename = separator >= 0 ? path.slice(separator + 1) : path;
      const { data, error } = await this.bucket.list(folder, { search: filename, limit: 100 });
      if (!error && data?.some((entry) => entry.name === filename)) {
        return { key: path };
      }
    } catch {}

    try {
      const sql = getSql();
      const rows = await sql`SELECT 1 FROM storage_fallback WHERE path = ${path} LIMIT 1`;
      if (rows && rows.length > 0) return { key: path };
    } catch {}

    return null;
  }

  async delete(path: string): Promise<void> {
    try {
      await this.bucket.remove([path]);
    } catch {}
    try {
      await getSql()`DELETE FROM storage_fallback WHERE path = ${path}`;
    } catch {}
  }

  async deleteMany(paths: string[]): Promise<void> {
    if (!paths.length) return;
    try {
      await this.bucket.remove(paths);
    } catch {}
    try {
      await getSql()`DELETE FROM storage_fallback WHERE path IN ${getSql()(paths)}`;
    } catch {}
  }

  async scanAndCleanExpiredImages(cutoffTime: number, maxItems = 5000): Promise<{ cleaned: number; filesFound: number }> {
    let cleaned = 0;
    let filesFound = 0;

    // Obtener lista de buckets a revisar
    let bucketNames = [this.bucketName];
    try {
      const { data: bList } = await supabaseAdmin().storage.listBuckets();
      if (bList && Array.isArray(bList)) {
        bucketNames = Array.from(new Set([this.bucketName, ...bList.map((b) => b.name)]));
      }
    } catch {
      // Usar bucketName por defecto si falla el listado
    }

    for (const bName of bucketNames) {
      // Revisar el bucket de conversación o cualquiera con nombre de imágenes/comprobantes/media
      const isTarget = bName === this.bucketName || /media|comprobante|receipt|image|conversat/i.test(bName);
      if (!isTarget) continue;

      const storageBucket = supabaseAdmin().storage.from(bName);
      const toDelete: string[] = [];

      const scanFolder = async (folder = "") => {
        if (toDelete.length >= maxItems) return;
        const { data, error } = await storageBucket.list(folder, {
          limit: 1000,
          sortBy: { column: "created_at", order: "asc" },
        });
        if (error || !data) return;

        for (const item of data) {
          if (toDelete.length >= maxItems) break;
          const itemPath = folder ? `${folder}/${item.name}` : item.name;
          if (item.id === null || !item.metadata) {
            // Es un directorio
            await scanFolder(itemPath);
          } else {
            // Es un archivo: verificar si es imagen
            const isImage = itemPath.includes("/images/") ||
                            itemPath.includes("/comprobantes/") ||
                            /\.(jpg|jpeg|png|webp|heic|gif)$/i.test(item.name) ||
                            (typeof item.metadata?.mimetype === "string" && item.metadata.mimetype.startsWith("image/"));
            if (!isImage) continue;

            const created = item.created_at ? new Date(item.created_at).getTime() : 0;
            const updated = item.updated_at ? new Date(item.updated_at).getTime() : 0;
            const fileTime = created || updated || 0;

            if (fileTime > 0 && fileTime <= cutoffTime) {
              toDelete.push(itemPath);
            }
          }
        }
      };

      await scanFolder("");
      filesFound += toDelete.length;

      // Borrado en lotes de 100 archivos
      for (let i = 0; i < toDelete.length; i += 100) {
        const chunk = toDelete.slice(i, i + 100);
        try {
          const { error } = await storageBucket.remove(chunk);
          if (!error) {
            cleaned += chunk.length;
          }
        } catch {
          // Continuar con siguientes lotes
        }
      }
    }

    // Limpiar también registros vencidos del fallback en PostgreSQL
    try {
      const deletedFallback = await getSql()`DELETE FROM storage_fallback WHERE created_at <= ${cutoffTime}`;
      cleaned += (deletedFallback as unknown as { count?: number }).count || 0;
    } catch {}

    return { cleaned, filesFound };
  }
}

const mediaBucket = new SupabaseMediaBucket();

export function getMediaBucket(): SupabaseMediaBucket {
  return mediaBucket;
}
