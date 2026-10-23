import { z } from "zod";
import { finalizeUploadInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { MAX_FILES_PER_UPLOAD, finalizeUploads } from "@/lib/server/services/documents";

export const POST = handler(async (req) => {
  const ctx = await requireWorkspace();
  const { files } = await readJson(req, z.object({ files: z.array(finalizeUploadInput).min(1).max(MAX_FILES_PER_UPLOAD) }));
  return ok(await finalizeUploads(ctx, files));
});
