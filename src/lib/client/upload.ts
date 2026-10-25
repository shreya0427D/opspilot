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
  const text = `${e?.name ?? ""} ${e?.message ?? ""}`;
  if (e?.name === "AbortError" || /abort/i.test(text)) return new UploadError("canceled", "Upload canceled.");
  if (/unauthori|forbidden|401|403|sign in/i.test(text)) return new UploadError("unauthorized", "Upload was refused. Sign out and back in, then try again.");
  if (/size|too large|maxSize/i.test(text)) return new UploadError("too_large", "File is larger than 10 MB.");
  if (/type|accept|mime/i.test(text)) return new UploadError("type", "Only PDF, PNG, JPG or WEBP files are supported.");
  if (/EDGESTORE|configur|access key|secret/i.test(text)) return new UploadError("not_configured", "File storage isn't configured on the server yet.");
  if (/quota|limit/i.test(text)) return new UploadError("quota", "Storage quota reached for this project.");
  if (/network|fetch|Failed to fetch/i.test(text)) return new UploadError("network", "Network error during upload. Try again.");
  return new UploadError("unknown", "Upload failed. Try again.");
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
