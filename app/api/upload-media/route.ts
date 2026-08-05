import { handleMediaUpload } from "@/lib/server/media-upload";

export async function POST(req: Request) {
  return handleMediaUpload(req, "audio");
}
