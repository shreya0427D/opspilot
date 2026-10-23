"use client";

import { UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client/api";

interface ImportResult {
  imported: number;
  suggested?: number;
  errors: { row: number; message: string }[];
}

export function CsvImportButton({ kind, hint }: { kind: "clients" | "payments"; hint: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onFile(file: File) {
    if (file.size > 1_000_000) return toast.error("CSV files must be under 1 MB");
    setBusy(true);
    try {
      const res = await api<ImportResult>("/api/import", { body: { kind, csv: await file.text() } });
      setResult(res);
      toast.success(`Imported ${res.imported} row${res.imported === 1 ? "" : "s"}${res.suggested ? `, ${res.suggested} matches suggested` : ""}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="inline-flex flex-col items-end">
      <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Button variant="outline" onClick={() => input.current?.click()} disabled={busy} title={hint}>
        <UploadIcon /> {busy ? "Importing…" : "Import CSV"}
      </Button>
      {result && result.errors.length > 0 && (
        <details className="mt-2 max-w-sm text-right text-xs text-muted-foreground">
          <summary className="cursor-pointer text-warning">{result.errors.length} row(s) skipped</summary>
          <ul className="mt-1 space-y-0.5">
            {result.errors.slice(0, 20).map((e) => (
              <li key={e.row}>
                Row {e.row}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
