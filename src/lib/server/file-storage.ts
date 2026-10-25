import "server-only";
import type { DocumentRecord } from "@/lib/domain/types";
import { edgeStoreRouter } from "@/lib/edgestore/router";
import { adminBucket } from "@/lib/firebase/admin";
import { AppError, forbidden, notFound } from "./errors";

// One place for reading, confirming and deleting uploaded invoice files. New uploads live in a
// private EdgeStore bucket; older records may still point at Firebase Storage.

const SIGNED_URL_TTL_SECONDS = 60;
const files = () => edgeStoreRouter.client.invoiceFiles;

export function edgeStoreConfigured() {
  return !!process.env.EDGESTORE_ACCESS_KEY && !!process.env.EDGESTORE_SECRET_KEY;
}

function assertConfigured() {
  if (!edgeStoreConfigured()) {
    throw new AppError(503, "storage_not_configured", "File storage isn't configured (EDGESTORE_ACCESS_KEY / EDGESTORE_SECRET_KEY).");
  }
}

/**
 * Confirms that an uploaded file exists and was stored under this workspace and document id.
 * The path comes from EdgeStore (set server-side at upload), so a client can't claim another
 * workspace's file by sending its URL.
 */
export async function verifyUploadedFile(workspaceId: string, documentId: string, url: string) {
  assertConfigured();
  let record: { size: number; path: Record<string, string | undefined> };
  try {
    record = (await files().get({ url })) as unknown as typeof record;
  } catch {
    throw notFound("Uploaded file not found");
  }
  if (record.path.workspace !== workspaceId || record.path.document !== documentId) throw forbidden("Invalid upload");
  return { size: record.size };
}

async function downloadEdgeStore(url: string): Promise<Buffer> {
  assertConfigured();
  const { signedUrl } = (await files().createSignedUrl({ url, expiresIn: SIGNED_URL_TTL_SECONDS })) as { signedUrl: string };
  const res = await fetch(signedUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new AppError(502, "storage_read_failed", `Couldn't read the stored file (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export function downloadByUrl(url: string) {
  return downloadEdgeStore(url);
}

/** Reads a document's bytes for authorized server-side processing. */
export async function downloadDocument(workspaceId: string, record: DocumentRecord): Promise<Buffer> {
  if (record.storageProvider === "edgestore") {
    if (!record.fileUrl || record.workspaceId !== workspaceId) throw forbidden("Document is outside this workspace");
    return downloadEdgeStore(record.fileUrl);
  }
  if (!record.storagePath.startsWith(`workspaces/${workspaceId}/`)) throw forbidden("Document is outside this workspace");
  const [bytes] = await adminBucket().file(record.storagePath).download();
  return bytes;
}

/** Makes an accepted temporary upload permanent (unconfirmed uploads expire after 24h). */
export async function confirmUpload(url: string) {
  assertConfigured();
  await files().confirm({ url });
}

export async function deleteStoredFile(record: Pick<DocumentRecord, "storageProvider" | "fileUrl" | "storagePath">) {
  if (record.storageProvider === "edgestore") {
    if (record.fileUrl && edgeStoreConfigured()) await files().delete({ url: record.fileUrl }).catch(() => undefined);
    return;
  }
  if (record.storagePath) await adminBucket().file(record.storagePath).delete({ ignoreNotFound: true });
}

export async function deleteUploadByUrl(url: string) {
  if (edgeStoreConfigured()) await files().delete({ url }).catch(() => undefined);
}
