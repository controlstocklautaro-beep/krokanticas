import { getMediaBucket } from "@/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const marker = "/api/media/";
  const pathname = new URL(req.url).pathname;
  const encodedKey = pathname.slice(pathname.indexOf(marker) + marker.length);
  const key = encodedKey.split("/").map(decodeURIComponent).join("/");
  if (!key.startsWith("businesses/") || key.includes("..")) {
    return Response.json({ error: "Archivo inválido" }, { status: 400 });
  }
  const object = await getMediaBucket().get(key);
  if (!object) return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}
