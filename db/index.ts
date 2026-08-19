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
    const { error } = await this.bucket.upload(path, new Uint8Array(contents), {
      contentType: options.httpMetadata?.contentType ?? "application/octet-stream",
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw new Error(`No se pudo guardar el archivo: ${error.message}`);
  }

  async get(path: string): Promise<SupabaseMediaObject | null> {
    const { data, error } = await this.bucket.download(path);
    if (error || !data) return null;
    return new SupabaseMediaObject(data);
  }

  async head(path: string): Promise<{ key: string } | null> {
    const separator = path.lastIndexOf("/");
    const folder = separator >= 0 ? path.slice(0, separator) : "";
    const filename = separator >= 0 ? path.slice(separator + 1) : path;
    const { data, error } = await this.bucket.list(folder, { search: filename, limit: 100 });
    if (error) throw new Error(`No se pudo consultar el archivo: ${error.message}`);
    return data?.some((entry) => entry.name === filename) ? { key: path } : null;
  }

  async delete(path: string): Promise<void> {
    const { error } = await this.bucket.remove([path]);
    if (error) throw new Error(`No se pudo eliminar el archivo: ${error.message}`);
  }
}

const mediaBucket = new SupabaseMediaBucket();

export function getMediaBucket(): SupabaseMediaBucket {
  return mediaBucket;
}
