import { NextResponse } from "next/server";
import { getMediaBucket } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom, normalizePhone } from "./api-utils";
import { requireBusinessAccess } from "./business-context";
import { getChat, insertMessage, upsertChat, whatsappReplyWindow } from "./chat-store";
import { deliverOutboundMessage } from "./outbound-webhook";

function safeFilename(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(-120) || "archivo";
}

export function mediaProxyUrl(storagePath: string) {
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return `/api/media/${encodedPath}`;
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
    const sender = formData.get("sender") === "agent" ? "agent" : "user";
    if (sender === "agent") {
      const replyWindow = await whatsappReplyWindow(businessId, phoneNumber);
      if (!replyWindow.canReply) {
        throw new ApiError("Pasaron más de 24 horas desde el último mensaje del cliente. Continuá desde WhatsApp.", 409);
      }
    }

    const folder = kind === "image" ? "images" : "audios";
    const storagePath = `businesses/${businessId}/${folder}/${phoneNumber.slice(1)}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
    await getMediaBucket().put(storagePath, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || (kind === "image" ? "image/png" : "audio/ogg") },
      customMetadata: { businessId, phoneNumber },
    });
    const url = mediaProxyUrl(storagePath);
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
    let delivery: "sent" | "failed" | "not_configured" | "received" = "received";
    if (sender === "agent") {
      const signedUrl = await getMediaBucket().signedUrl(storagePath);
      delivery = await deliverOutboundMessage({
        businessId,
        phone_number: phoneNumber,
        message: signedUrl,
        type: kind,
        media_url: signedUrl,
        content_type: file.type,
        file_name: file.name,
      });
    }
    return NextResponse.json({ success: true, url, delivery });
  } catch (error) {
    return apiErrorResponse(error, `Error subiendo ${kind}`);
  }
}
