import "server-only";
import { initEdgeStore } from "@edgestore/server";
import { z } from "zod";
import { edgeStoreCredentials } from "./credentials";

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

function buildRouter() {
  const es = initEdgeStore.context<EdgeStoreContext>().create();
  return es.router({
    invoiceFiles: es
      .fileBucket({ maxSize: MAX_INVOICE_BYTES, accept: INVOICE_MIME_TYPES })
      .input(z.object({ workspaceId: z.string().min(1).max(128), documentId: z.string().regex(/^[a-f0-9]{32}$/) }))
      .path(({ ctx, input }) => [{ workspace: ctx.workspaceId }, { document: input.documentId }])
      .accessControl("private")
      .beforeUpload(({ ctx, input }) => ctx.workspaceId === input.workspaceId)
      .beforeDelete(() => false),
  });
}

export type EdgeStoreRouter = ReturnType<typeof buildRouter>;

let router: EdgeStoreRouter | null = null;

/**
 * The SDK throws as soon as a router is created without keys, which would crash every route
 * importing it. So the router is created lazily, only when credentials exist. The SDK reads
 * EDGESTORE_*; the dashboard's EDGE_STORE_* names are mapped onto them first (server-only).
 * Returns null when storage isn't configured.
 */
export function getEdgeStoreRouter(): EdgeStoreRouter | null {
  if (router) return router;
  const credentials = edgeStoreCredentials();
  if (!credentials) return null;
  process.env.EDGESTORE_ACCESS_KEY ||= credentials.accessKey;
  process.env.EDGESTORE_SECRET_KEY ||= credentials.secretKey;
  router = buildRouter();
  return router;
}
