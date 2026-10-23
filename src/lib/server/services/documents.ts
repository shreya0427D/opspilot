import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { fileTypeFromBuffer } from "file-type";
import { PDFDocument } from "pdf-lib";
import type { DocumentRecord } from "@/lib/domain/types";
import { adminBucket, adminDb } from "@/lib/firebase/admin";
import { createTask } from "@/lib/tasks/engine";
import { badRequest, forbidden, notFound } from "../errors";
import type { WorkspaceContext } from "../session";
import { audit, ws } from "../workspace-data";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PAGES = 20;
export const MAX_FILES_PER_UPLOAD = 20;
const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export interface FinalizeFile {
  documentId: string;
  storagePath: string;
  fileName: string;
}

type Validation = { ok: true; mime: string; pages: number; sha256: string; size: number } | { ok: false; reason: string };

/** Validates the stored bytes themselves — never trusts the extension or client content type. */
async function validateUpload(bytes: Buffer): Promise<Validation> {
  if (bytes.length === 0) return { ok: false, reason: "File is empty" };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, reason: "File is larger than 10 MB" };
  const type = await fileTypeFromBuffer(bytes);
  if (!type || !ALLOWED_MIME.has(type.mime)) return { ok: false, reason: "Only PDF, PNG, JPG and WEBP files are supported" };
  let pages = 1;
  if (type.mime === "application/pdf") {
    try {
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
      pages = pdf.getPageCount();
    } catch {
      return { ok: false, reason: "PDF is damaged or password-protected" };
    }
    if (pages > MAX_PAGES) return { ok: false, reason: `PDF has ${pages} pages; the limit is ${MAX_PAGES}` };
  }
  return { ok: true, mime: type.mime, pages, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
}

export async function finalizeUploads(ctx: WorkspaceContext, files: FinalizeFile[]) {
  if (files.length === 0 || files.length > MAX_FILES_PER_UPLOAD) throw badRequest(`Upload between 1 and ${MAX_FILES_PER_UPLOAD} files`);
  const col = ws(ctx.workspaceId);
  const bucket = adminBucket();
  const accepted: string[] = [];
  const results: { documentId: string; fileName: string; status: string; reason?: string }[] = [];

  for (const f of files) {
    // The path must be inside this workspace and match the document ID the client claims.
    if (!f.storagePath.startsWith(`workspaces/${ctx.workspaceId}/uploads/${f.documentId}/`)) throw forbidden("Invalid upload path");
    const docRef = col.documents.doc(f.documentId);
    if ((await docRef.get()).exists) throw badRequest("Upload was already processed");

    const file = bucket.file(f.storagePath);
    const [exists] = await file.exists();
    if (!exists) throw notFound(`Upload ${f.fileName} not found`);
    const [bytes] = await file.download();
    const v = await validateUpload(bytes);

    const base: Omit<DocumentRecord, "createdAt"> = {
      fileName: f.fileName.slice(0, 255),
      storagePath: f.storagePath,
      mime: v.ok ? v.mime : "application/octet-stream",
      sizeBytes: bytes.length,
      pageCount: v.ok ? v.pages : null,
      sha256: v.ok ? v.sha256 : null,
      status: v.ok ? "uploaded" : "rejected",
      error: v.ok ? undefined : v.reason,
      invoiceIds: [],
      uploadedBy: ctx.uid,
    };

    if (v.ok) {
      const dupe = await col.documents.where("sha256", "==", v.sha256).limit(1).get();
      if (!dupe.empty) {
        base.status = "rejected";
        base.error = "This exact file was already uploaded";
      }
    }
    if (base.status === "rejected") await file.delete({ ignoreNotFound: true });
    await docRef.set({ ...base, createdAt: FieldValue.serverTimestamp() });
    await audit(ctx.workspaceId, ctx.uid, "document.uploaded", `documents/${f.documentId}`, { status: base.status });
    results.push({ documentId: f.documentId, fileName: base.fileName, status: base.status, reason: base.error });
    if (base.status === "uploaded") accepted.push(f.documentId);
  }

  let taskId: string | null = null;
  if (accepted.length) {
    const res = await createTask({
      workspaceId: ctx.workspaceId,
      actorUid: ctx.uid,
      command: `Extract ${accepted.length} uploaded invoice${accepted.length === 1 ? "" : "s"}`,
      submissionKey: `upload:${accepted.sort().join(",")}`,
      trigger: "upload",
      intent: "extract_documents",
      params: { documentIds: accepted },
    });
    taskId = res.taskId;
    const batch = adminDb().batch();
    for (const id of accepted) batch.update(col.documents.doc(id), { status: "processing", taskId });
    await batch.commit();
  }
  return { results, taskId };
}

export async function readDocumentFile(ctx: WorkspaceContext, documentId: string) {
  const record = (await ws(ctx.workspaceId).documents.doc(documentId).get()).data() as DocumentRecord | undefined;
  if (!record || record.status === "rejected") throw notFound("Document not found");
  const [bytes] = await adminBucket().file(record.storagePath).download();
  return { bytes, mime: record.mime, fileName: record.fileName };
}

export async function deleteDocument(ctx: WorkspaceContext, documentId: string) {
  const ref = ws(ctx.workspaceId).documents.doc(documentId);
  const record = (await ref.get()).data() as DocumentRecord | undefined;
  if (!record) throw notFound("Document not found");
  await adminBucket().file(record.storagePath).delete({ ignoreNotFound: true });
  await ref.delete();
  await audit(ctx.workspaceId, ctx.uid, "document.deleted", `documents/${documentId}`);
}
