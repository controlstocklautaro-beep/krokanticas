import { NextResponse } from "next/server";
import { getMediaBucket } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom, normalizePhone } from "./api-utils";
import { requireBusinessAccess } from "./business-context";
import { getChat, insertMessage, upsertChat } from "./chat-store";

function safeFilename(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(-120) || "archivo";
}

function publicMediaUrl(req: Request, storagePath: string) {
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${new URL(req.url).origin}/api/media/${encodedPath}`;
}

export async function handleMediaUpload(req: Request, kind: "image" | "audio") {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const rawPhone = formData.get("phone_number");
    const businessId = businessIdFrom(req, formData.get("businessId"));
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    if (!(file instanceof File)) throw new ApiError("Se requiere 'file' y 'phone_number'", 400);
    const phoneNumber = normalizePhone(rawPhone);
    const expectedPrefix = kind === "image" ? "image/" : "audio/";
    if (!file.type.startsWith(expectedPrefix)) throw new ApiError(`El archivo debe ser de tipo ${kind}`, 415);
    const maxSize = kind === "image" ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxSize) throw new ApiError("El archivo supera el tamaño permitido", 413);

    const folder = kind === "image" ? "images" : "audios";
    const storagePath = `businesses/${businessId}/${folder}/${phoneNumber.slice(1)}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
    await getMediaBucket().put(storagePath, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || (kind === "image" ? "image/png" : "audio/ogg") },
      customMetadata: { businessId, phoneNumber },
    });
    const url = publicMediaUrl(req, storagePath);
    const sender = formData.get("sender") === "agent" ? "agent" : "user";
    await insertMessage({
      businessId,
      phoneNumber,
      message: url,
      sender,
      type: kind,
      storagePath,
      contentType: file.type,
    });
    const chat = await getChat(businessId, phoneNumber);
    await upsertChat(businessId, phoneNumber, chat?.user_name ?? phoneNumber);
    return NextResponse.json({ success: true, url });
  } catch (error) {
    return apiErrorResponse(error, `Error subiendo ${kind}`);
  }
}
