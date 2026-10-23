"use client";

import { orderBy } from "firebase/firestore";
import { ref, uploadBytesResumable } from "firebase/storage";
import { ExternalLinkIcon, FileUpIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
import type { DocumentRecord } from "@/lib/domain/types";
import { firebase } from "@/lib/firebase/client";

const ACCEPT = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 20;

export default function DocumentsPage() {
  const router = useRouter();
  const { workspaceId } = useAuth();
  const docs = useLiveCollection<DocumentRecord>(useWsPath("documents"), [orderBy("createdAt", "desc")], "recent");
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(files: File[]) {
    if (!workspaceId) return;
    if (files.length > MAX_FILES) return toast.error(`Upload at most ${MAX_FILES} files at a time`);
    const valid = files.filter((f) => ACCEPT.includes(f.type) && f.size > 0 && f.size <= MAX_BYTES);
    const skipped = files.length - valid.length;
    if (skipped) toast.warning(`${skipped} file(s) skipped: only PDF, PNG, JPG or WEBP up to 10 MB`);
    if (!valid.length) return;

    setProgress(0);
    const total = valid.reduce((s, f) => s + f.size, 0);
    const sent = new Map<string, number>();
    try {
      const uploaded = await Promise.all(
        valid.map(async (file) => {
          const documentId = crypto.randomUUID().replaceAll("-", "");
          const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
          const storagePath = `workspaces/${workspaceId}/uploads/${documentId}/${safeName}`;
          const task = uploadBytesResumable(ref(firebase().storage, storagePath), file, { contentType: file.type });
          task.on("state_changed", (s) => {
            sent.set(documentId, s.bytesTransferred);
            setProgress(Math.round(([...sent.values()].reduce((a, b) => a + b, 0) / total) * 100));
          });
          await task;
          return { documentId, storagePath, fileName: file.name.slice(0, 255) };
        }),
      );
      const res = await api<{ taskId: string | null; results: { status: string; fileName: string; reason?: string }[] }>(
        "/api/documents/finalize",
        { body: { files: uploaded } },
      );
      const rejected = res.results.filter((r) => r.status === "rejected");
      rejected.forEach((r) => toast.error(`${r.fileName}: ${r.reason}`));
      if (res.taskId) {
        toast.success("Upload complete. Extracting invoice details…");
        router.push(`/app/tasks/${res.taskId}`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

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

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
        className={`mb-6 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${dragging ? "border-primary bg-muted/60" : ""}`}
      >
        <FileUpIcon className="mb-2 size-6 text-muted-foreground" aria-hidden />
        <p className="font-medium">Drop invoice files here</p>
        <p className="mt-1 text-sm text-muted-foreground">PDF, PNG, JPG or WEBP · up to 10 MB and 20 pages each · 20 files at a time</p>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT.join(",")}
          className="sr-only"
          onChange={(e) => e.target.files && upload(Array.from(e.target.files))}
        />
        <Button className="mt-4" onClick={() => input.current?.click()} disabled={progress !== null}>
          Choose files
        </Button>
        {progress !== null && (
          <div className="mt-4 w-full max-w-xs" aria-live="polite">
            <Progress value={progress} />
            <p className="mt-1 text-xs text-muted-foreground">Uploading… {progress}%</p>
          </div>
        )}
      </div>

      {docs.error && <ErrorState message={docs.error} />}
      {docs.loading ? (
        <Skeleton className="h-32 w-full" />
      ) : docs.data.length === 0 ? (
        <EmptyState title="No documents yet" description="Uploaded files and their extraction status appear here." />
      ) : (
        <div className="rounded-xl border">
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
                  <TableCell className="max-w-56">
                    <div className="truncate font-medium">{d.fileName}</div>
                    {d.error && <div className="truncate text-xs text-muted-foreground">{d.error}</div>}
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
