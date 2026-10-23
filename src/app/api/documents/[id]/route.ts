import { handler, ok } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { deleteDocument, readDocumentFile } from "@/lib/server/services/documents";

/** Streams the original file after authorization. Files are never publicly readable. */
export const GET = handler<RouteContext<"/api/documents/[id]">>(async (_req, { params }) => {
  const ctx = await requireWorkspace();
  const { id } = await params;
  const { bytes, mime, fileName } = await readDocumentFile(ctx, id);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
});

export const DELETE = handler<RouteContext<"/api/documents/[id]">>(async (_req, { params }) => {
  const ctx = await requireWorkspace();
  const { id } = await params;
  await deleteDocument(ctx, id);
  return ok();
});
