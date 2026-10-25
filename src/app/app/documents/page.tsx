"use client";

import { orderBy } from "firebase/firestore";
import { ExternalLinkIcon, FileUpIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, PageHeader } from "@/components/app/page-header";
import { useAuth, useWsPath } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/client/api";
import { useLiveCollection, toMillis } from "@/lib/client/firestore-hooks";
import { relativeTime } from "@/lib/client/format";
import { UploadError, uploadFile } from "@/lib/client/upload";
import { EdgeStoreProvider, useEdgeStore } from "@/lib/edgestore/client";
import type { DocumentRecord } from "@/lib/domain/types";

const ACCEPT = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 20;

type UploadStatus = "uploading" | "processing" | "done" | "failed";

interface UploadEntry {
  key: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  documentId?: string;
  taskId?: string | null;
}

interface FinalizeResult {
  taskId: string | null;
  results: { documentId: string; status: string; fileName: string; reason?: string }[];
}

export default function DocumentsPage() {
  return (
    <EdgeStoreProvider>
      <Documents />
    </EdgeStoreProvider>
  );
}

function Documents() {
  const { workspaceId } = useAuth();
  const { edgestore } = useEdgeStore();
  const docs = useLiveCollection<DocumentRecord>(useWsPath("documents"), [orderBy("createdAt", "desc")], "recent");
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [entries, setEntries] = useState<UploadEntry[]>([]);

  const patch = (key: string, p: Partial<UploadEntry>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...p } : e)));
  const busy = entries.some((e) => e.status === "uploading");

  /** Uploads each file, then registers only the ones that actually reached storage. */
  async function run(batch: UploadEntry[]) {
    if (!workspaceId) return;
    const uploaded: { key: string; documentId: string; fileUrl: string; fileName: string }[] = [];
    await Promise.all(
      batch.map(async (entry) => {
        // A fresh id per attempt: a failed upload leaves no record, so retries can't duplicate.
        const documentId = crypto.randomUUID().replaceAll("-", "");
        patch(entry.key, { status: "uploading", progress: 0, error: undefined });
        try {
          const { url } = await uploadFile(edgestore, { file: entry.file, workspaceId, documentId }, (pct) => patch(entry.key, { progress: pct }));
          uploaded.push({ key: entry.key, documentId, fileUrl: url, fileName: entry.file.name.slice(0, 255) });
        } catch (err) {
          patch(entry.key, { status: "failed", error: err instanceof UploadError ? err.message : "Upload failed. Try again." });
        }
      }),
    );
    if (!uploaded.length) return;

    try {
      const res = await api<FinalizeResult>("/api/documents/finalize", {
        body: { files: uploaded.map(({ documentId, fileUrl, fileName }) => ({ documentId, fileUrl, fileName })) },
      });
      for (const u of uploaded) {
        const r = res.results.find((x) => x.documentId === u.documentId);
        if (!r || r.status === "rejected") {
          patch(u.key, { status: "failed", error: r?.reason ?? "The file was rejected", documentId: u.documentId });
        } else {
          patch(u.key, { status: "processing", documentId: u.documentId, taskId: res.taskId });
        }
      }
      if (res.taskId) toast.success("Uploaded. Reading the invoices now…");
    } catch (err) {
      for (const u of uploaded) patch(u.key, { status: "failed", error: errorMessage(err) });
    }
  }

  function upload(files: File[]) {
    if (!workspaceId) {
      toast.error("Your workspace is still loading. Try again in a moment.");
      return;
    }
    if (files.length > MAX_FILES) {
      toast.error(`Upload at most ${MAX_FILES} files at a time`);
      return;
    }
    const valid = files.filter((f) => ACCEPT.includes(f.type) && f.size > 0 && f.size <= MAX_BYTES);
    const skipped = files.length - valid.length;
    if (skipped) toast.warning(`${skipped} file(s) skipped: only PDF, PNG, JPG or WEBP up to 10 MB`);
    if (input.current) input.current.value = "";
    if (!valid.length) return;
    const batch: UploadEntry[] = valid.map((file) => ({ key: crypto.randomUUID(), file, status: "uploading", progress: 0 }));
    setEntries((list) => [...batch, ...list].slice(0, 40));
    void run(batch);
  }

  // Processing outcome comes from the live document record (including AI extraction failures).
  const liveStatus = (e: UploadEntry): { status: UploadStatus; error?: string } => {
    if (e.status !== "processing" || !e.documentId) return { status: e.status, error: e.error };
    const d = docs.data.find((x) => x.id === e.documentId);
    if (d?.status === "processed") return { status: "done" };
    if (d?.status === "failed" || d?.status === "rejected") return { status: "failed", error: d.error ?? "Processing failed" };
    return { status: "processing" };
  };

  async function remove(id: string) {
    if (!confirm("Delete this file? Invoices already created from it are kept.")) return;
    try {
      await api(`/api/documents/${id}`, { method: "DELETE" });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Documents" description="Upload invoices as PDF or images. Each one is read, checked, and added to your invoices." />
      <StorageStatus />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(Array.from(e.dataTransfer.files));
        }}
        className={`relative mb-6 flex flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? "border-lx-gold bg-accent/60" : "border-input bg-card"}`}
      >
        <span className="mb-3 grid size-12 place-items-center rounded-full bg-lx-ink text-lx-gold-light ring-4 ring-lx-gold/15">
          <FileUpIcon className="size-5" aria-hidden />
        </span>
        <p className="font-display text-2xl">Drop invoice files here</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">PDF, PNG, JPG or WEBP · up to 10 MB and 20 pages each · 20 files at a time</p>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT.join(",")}
          className="sr-only"
          disabled={!workspaceId}
          onChange={(e) => e.target.files && upload(Array.from(e.target.files))}
        />
        <Button size="lg" className="mt-5" onClick={() => input.current?.click()} disabled={busy || !workspaceId}>
          {workspaceId ? (busy ? "Uploading…" : "Choose files") : "Loading…"}
        </Button>
      </div>

      {entries.length > 0 && (
        <ul className="mb-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" aria-live="polite" aria-label="Uploads">
          {entries.map((e) => {
            const { status, error } = liveStatus(e);
            return (
              <li key={e.key} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 basis-48 truncate font-medium" title={e.file.name}>{e.file.name}</span>
                {status === "uploading" && (
                  <span className="flex w-40 items-center gap-2">
                    <Progress value={e.progress} className="flex-1" />
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{e.progress}%</span>
                  </span>
                )}
                {status === "processing" && (
                  <span className="flex items-center gap-2">
                    <StatusBadge status="processing" />
                    {e.taskId && (
                      <Link href={`/app/tasks/${e.taskId}`} className="text-xs underline-offset-4 hover:underline">
                        View progress
                      </Link>
                    )}
                  </span>
                )}
                {status === "done" && <StatusBadge status="processed" />}
                {status === "failed" && (
                  <span className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <StatusBadge status="failed" />
                    <span className="min-w-0 flex-1 text-xs break-words text-destructive">{error}</span>
                    {!e.documentId && (
                      <Button size="xs" variant="outline" onClick={() => void run([e])}>
                        <RotateCcwIcon /> Retry
                      </Button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {docs.error && <ErrorState message={docs.error} />}
      {docs.loading ? (
        <Skeleton className="h-32 w-full" />
      ) : docs.data.length === 0 ? (
        <EmptyState title="No documents yet" description="Uploaded files and their extraction status appear here." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.data.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="max-w-72 whitespace-normal">
                    <div className="truncate font-medium" title={d.fileName}>{d.fileName}</div>
                    {d.error && <div className="mt-0.5 text-xs break-words text-muted-foreground">{d.error}</div>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={d.status} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{relativeTime(toMillis(d.createdAt))}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {d.invoiceIds[0] && (
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/app/invoices/${d.invoiceIds[0]}`}>Invoice</Link>
                        </Button>
                      )}
                      {d.status !== "rejected" && (
                        <Button asChild size="icon-sm" variant="ghost" aria-label="Open file">
                          <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">
                            <ExternalLinkIcon />
                          </a>
                        </Button>
                      )}
                      <Button size="icon-sm" variant="ghost" aria-label="Delete file" onClick={() => remove(d.id)}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

type StorageStatusResult = {
  present: Record<string, boolean>;
  initialized: boolean;
  initError?: string;
  deployment: { env: string; commit: string | null };
};

/**
 * Storage diagnostic, fetched with the app's own same-origin request (the session cookie is
 * SameSite=Strict, so opening the API URL from another site arrives without it). Shows only
 * whether each key has a value, never the value.
 */
function StorageStatus() {
  const [status, setStatus] = useState<StorageStatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<StorageStatusResult>("/api/storage-status").then(setStatus, (err) => setError(errorMessage(err)));
  }, []);
  return (
    <details className="mb-4 rounded-lg border border-border bg-card px-3 py-2 text-xs break-words text-muted-foreground">
      <summary className="cursor-pointer select-none">
        Storage status:{" "}
        {error ? `couldn't check (${error})` : !status ? "checking…" : status.initialized ? "ready" : "not ready"}
      </summary>
      {status && (
        <ul className="mt-2 space-y-0.5 font-mono">
          {Object.entries(status.present).map(([name, has]) => (
            <li key={name}>
              {name}: {has ? "present" : "not set"}
            </li>
          ))}
          <li>storage initialized: {status.initialized ? "yes" : `no${status.initError ? ` (${status.initError})` : ""}`}</li>
          <li>
            deployment: {status.deployment.env} @ {status.deployment.commit ?? "unknown"}
          </li>
        </ul>
      )}
    </details>
  );
}
