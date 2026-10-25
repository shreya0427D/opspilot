"use client";

import { ref, uploadBytesResumable, type UploadTask } from "firebase/storage";
import { firebase } from "@/lib/firebase/client";

/** No bytes accepted for this long → give up instead of showing 0% forever. */
const STALL_MS = 30_000;
/** Cap the SDK's own retrying (default is 10 minutes) so real failures surface quickly. */
const MAX_RETRY_MS = 45_000;

export class UploadError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Plain-language reasons for Firebase Storage error codes. */
export function describeStorageError(code: string): string {
  switch (code) {
    case "storage/bucket-not-found":
    case "storage/project-not-found":
      return "File storage isn't set up for this project yet.";
    case "storage/unauthorized":
    case "storage/unauthenticated":
      return "Upload was refused. Sign out and back in; if it persists, the storage security rules may not be deployed.";
    case "storage/quota-exceeded":
      return "Storage quota exceeded for this project.";
    case "storage/retry-limit-exceeded":
    case "upload/stalled":
      return "The upload didn't go through. Check your connection and try again.";
    case "storage/canceled":
      return "Upload canceled.";
    case "storage/invalid-checksum":
      return "The file was corrupted in transit. Try again.";
    default:
      return "Upload failed. Try again.";
  }
}

/**
 * Uploads one file with real progress events. Rejects with an UploadError (never hangs): either
 * the SDK reports an error, or the watchdog cancels an upload that makes no progress.
 */
export function uploadFile(path: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  const storage = firebase().storage;
  storage.maxUploadRetryTime = MAX_RETRY_MS;
  const task: UploadTask = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });

  return new Promise((resolve, reject) => {
    let lastBytes = -1;
    let stalled = false;
    const watchdog = setInterval(() => {
      const bytes = task.snapshot.bytesTransferred;
      if (bytes === lastBytes && bytes < file.size) {
        stalled = true;
        task.cancel();
      }
      lastBytes = bytes;
    }, STALL_MS);

    task.on(
      "state_changed",
      (snap) => onProgress(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
      (err) => {
        clearInterval(watchdog);
        const code = stalled ? "upload/stalled" : (err as { code?: string }).code ?? "storage/unknown";
        reject(new UploadError(code, describeStorageError(code)));
      },
      () => {
        clearInterval(watchdog);
        onProgress(1);
        resolve();
      },
    );
  });
}
