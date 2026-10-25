"use client";

import type { useEdgeStore } from "@/lib/edgestore/client";

/** No progress for this long → cancel instead of showing a frozen bar. */
const STALL_MS = 30_000;

export class UploadError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

type EdgeStore = ReturnType<typeof useEdgeStore>["edgestore"];

function describe(err: unknown, stalled: boolean): UploadError {
  if (stalled) return new UploadError("stalled", "The upload didn't go through. Check your connection and try again.");
  const e = err as { name?: string; message?: string; status?: number };
  // Match the message only: every SDK error is named "EdgeStoreClientError", and a browser
  // "TypeError: Failed to fetch" would otherwise look like a file-type error.
  const message = e?.message ?? "";
  if (e?.name === "AbortError" || /abort/i.test(message)) return new UploadError("canceled", "Upload canceled.");
  if (/unauthori|forbidden|401|403|sign in/i.test(message)) return new UploadError("unauthorized", "Upload was refused. Sign out and back in, then try again.");
  if (/size|too large|maxSize/i.test(message)) return new UploadError("too_large", "File is larger than 10 MB.");
  if (/file type|accept|mime/i.test(message)) return new UploadError("type", "Only PDF, PNG, JPG or WEBP files are supported.");
  // Only our server's own 503 means the storage keys are missing.
  if (/isn't configured on the server|storage_not_configured/i.test(message)) return new UploadError("not_configured", "File storage isn't configured on the server yet.");
  if (/Failed to parse response/i.test(message)) return new UploadError("server", "The upload service returned an unexpected response. Try again.");
  if (/quota|limit/i.test(message)) return new UploadError("quota", "Storage quota reached for this project.");
  if (/Error uploading file|network|Failed to fetch/i.test(message)) return new UploadError("network", "The file couldn't be sent to storage. Check your connection and try again.");
  return new UploadError("unknown", message ? `Upload failed: ${message.slice(0, 160)}` : "Upload failed. Try again.");
}

/**
 * Uploads one invoice to the private EdgeStore bucket with real progress events. Uploads are
 * temporary until the server verifies and confirms them, so abandoned files expire on their own.
 * Never hangs: SDK errors reject, and a stall watchdog aborts uploads that stop progressing.
 */
export async function uploadFile(
  edgestore: EdgeStore,
  params: { file: File; workspaceId: string; documentId: string },
  onProgress: (percent: number) => void,
): Promise<{ url: string }> {
  const controller = new AbortController();
  let last = -1;
  let current = 0;
  let stalled = false;
  const watchdog = setInterval(() => {
    if (current === last && current < 100) {
      stalled = true;
      controller.abort();
    }
    last = current;
  }, STALL_MS);
  try {
    const res = await edgestore.invoiceFiles.upload({
      file: params.file,
      input: { workspaceId: params.workspaceId, documentId: params.documentId },
      signal: controller.signal,
      onProgressChange: (p) => {
        current = p;
        onProgress(Math.round(p));
      },
      options: { temporary: true },
    });
    onProgress(100);
    return { url: res.url };
  } catch (err) {
    throw describe(err, stalled);
  } finally {
    clearInterval(watchdog);
  }
}
