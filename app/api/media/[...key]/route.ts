import { getMediaBucket } from "@/db";
import { requireBusinessAccess } from "@/lib/server/business-context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const marker = "/api/media/";
  const pathname = new URL(req.url).pathname;
  const encodedKey = pathname.slice(pathname.indexOf(marker) + marker.length);
  const key = encodedKey.split("/").map(decodeURIComponent).join("/");
  if (!key.startsWith("businesses/") || key.includes("..")) {
    return Response.json({ error: "Archivo inválido" }, { status: 400 });
  }
  const businessId = key.split("/")[1];
  if (!businessId) return Response.json({ error: "Archivo inválido" }, { status: 400 });
  await requireBusinessAccess(req, businessId, { allowIntegration: true });
  const object = await getMediaBucket().get(key);
  if (!object) return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Accept-Ranges", "bytes");
  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const total = object.body.size;
    if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= total) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    const partial = object.body.slice(start, end + 1, object.body.type);
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    headers.set("Content-Length", String(partial.size));
    return new Response(partial, { status: 206, headers });
  }
  return new Response(object.body, { headers });
}
