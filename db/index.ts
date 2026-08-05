import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

type RuntimeBindings = {
  DB?: D1Database;
  MEDIA?: R2Bucket;
};

export function getD1(): D1Database {
  const runtime = env as unknown as RuntimeBindings;
  if (!runtime.DB) throw new Error("El almacenamiento DB no está configurado");
  return runtime.DB;
}

export function getMediaBucket(): R2Bucket {
  const runtime = env as unknown as RuntimeBindings;
  if (!runtime.MEDIA) throw new Error("El almacenamiento MEDIA no está configurado");
  return runtime.MEDIA;
}
