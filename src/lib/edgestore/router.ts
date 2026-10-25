import "server-only";
import { initEdgeStore } from "@edgestore/server";
import { z } from "zod";

// File storage for uploaded invoices (EdgeStore, replacing Firebase Storage).
//
// Security model:
// - The context is built server-side from the verified Firebase session cookie and the caller's
//   workspace membership (see the route handler); the browser can't choose its workspace.
// - "private" access control: files have no public URL. Only the server reads them, through
//   short-lived signed URLs, and streams them to authorized users.
// - Uploads land under workspace/<id>/document/<id> and must match the caller's workspace.
// - Browser-initiated deletes are refused; deletion goes through our own authorized API.

export type EdgeStoreContext = {
  userId: string;
  workspaceId: string;
};

export const INVOICE_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export const MAX_INVOICE_BYTES = 10 * 1024 * 1024;

const es = initEdgeStore.context<EdgeStoreContext>().create();

export const edgeStoreRouter = es.router({
  invoiceFiles: es
    .fileBucket({ maxSize: MAX_INVOICE_BYTES, accept: INVOICE_MIME_TYPES })
    .input(z.object({ workspaceId: z.string().min(1).max(128), documentId: z.string().regex(/^[a-f0-9]{32}$/) }))
    .path(({ ctx, input }) => [{ workspace: ctx.workspaceId }, { document: input.documentId }])
    .accessControl("private")
    .beforeUpload(({ ctx, input }) => ctx.workspaceId === input.workspaceId)
    .beforeDelete(() => false),
});

export type EdgeStoreRouter = typeof edgeStoreRouter;
