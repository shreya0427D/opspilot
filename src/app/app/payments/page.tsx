"use client";

import { orderBy } from "firebase/firestore";
import { CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CsvImportButton } from "@/components/app/csv-import";
import { EmptyState, ErrorState, PageHeader } from "@/components/app/page-header";
import { useWsPath } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/client/api";
import { useLiveCollection } from "@/lib/client/firestore-hooks";
import { formatDate, money, outstandingOf } from "@/lib/client/format";
import type { Invoice, Payment } from "@/lib/domain/types";

export default function PaymentsPage() {
  const payments = useLiveCollection<Payment>(useWsPath("payments"), [orderBy("date", "desc")], "byDate");
  const invoices = useLiveCollection<Invoice>(useWsPath("invoices"));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const invoiceById = new Map(invoices.data.map((i) => [i.id, i]));

  async function decide(paymentId: string, decision: "confirm" | "reject", invoiceId?: string) {
    setBusyId(paymentId);
    try {
      await api(`/api/payments/${paymentId}`, { body: { decision, invoiceId } });
      toast.success(decision === "confirm" ? "Payment applied to invoice" : "Suggestion dismissed");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Payments"
        description="Import a bank or payments CSV. Matches are suggested by exact rules; nothing is applied until you confirm."
        actions={<CsvImportButton kind="payments" hint="Columns: date (YYYY-MM-DD), amount, currency, reference, payer" />}
      />
      {payments.error && <ErrorState message={payments.error} />}
      {payments.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : payments.data.length === 0 ? (
        <EmptyState title="No payments yet" description="Import a CSV with columns date, amount, currency, reference and payer." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden md:table-cell">Reference</TableHead>
                <TableHead>Match</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.data.map((p) => {
                const matched = p.invoiceId ? invoiceById.get(p.invoiceId) : undefined;
                const candidates = invoices.data.filter(
                  (i) => i.currency === p.currency && (i.status === "open" || i.status === "partially_paid") && i.reviewStatus !== "needs_review",
                );
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      {formatDate(p.date)}
                      {p.isSample && <StatusBadge status="sample" className="ml-2" />}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.amountMinor, p.currency)}</TableCell>
                    <TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell" title={p.reference ?? p.payerName ?? undefined}>{p.reference ?? p.payerName ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={p.matchStatus} />
                        {matched && <span className="text-xs">→ {matched.number}</span>}
                        {p.matchStatus === "suggested" && p.matchReason && <span className="text-xs text-muted-foreground">{p.matchReason}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.matchStatus === "suggested" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" disabled={busyId === p.id} onClick={() => decide(p.id, "confirm")}>
                            <CheckIcon /> Apply
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => decide(p.id, "reject")} aria-label="Dismiss suggestion">
                            <XIcon />
                          </Button>
                        </div>
                      )}
                      {(p.matchStatus === "unmatched" || p.matchStatus === "rejected") && (
                        <div className="flex justify-end gap-1">
                          <select
                            aria-label="Invoice to apply payment to"
                            className="h-8 max-w-40 rounded-md border border-input bg-card px-2 text-xs"
                            value={choice[p.id] ?? ""}
                            onChange={(e) => setChoice((c) => ({ ...c, [p.id]: e.target.value }))}
                          >
                            <option value="">Choose invoice</option>
                            {candidates.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.number} · {money(outstandingOf(i), i.currency)}
                              </option>
                            ))}
                          </select>
                          <Button size="sm" variant="outline" disabled={!choice[p.id] || busyId === p.id} onClick={() => decide(p.id, "confirm", choice[p.id])}>
                            Apply
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
