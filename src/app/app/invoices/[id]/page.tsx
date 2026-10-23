"use client";

import { orderBy } from "firebase/firestore";
import { ArrowLeftIcon, CheckIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { InvoiceForm } from "@/components/app/invoice-form";
import { ErrorState, PageHeader } from "@/components/app/page-header";
import { useAuth, useWsPath } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/client/api";
import { useLiveCollection, useLiveDoc, toMillis } from "@/lib/client/firestore-hooks";
import { formatDate, formatTime, invoiceDisplayStatus, money, outstandingOf } from "@/lib/client/format";
import type { Client, Invoice } from "@/lib/domain/types";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { workspace } = useAuth();
  const base = useWsPath("invoices");
  const invoice = useLiveDoc<Invoice>(base ? `${base}/${id}` : null);
  const clients = useLiveCollection<Client>(useWsPath("clients"), [orderBy("name")], "byName");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function action(a: "mark_paid" | "void" | "reopen") {
    setBusy(true);
    try {
      await api(`/api/invoices/${id}`, { method: "PATCH", body: { action: a } });
      toast.success("Invoice updated");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this invoice? This can't be undone.")) return;
    try {
      await api(`/api/invoices/${id}`, { method: "DELETE" });
      router.replace("/app/invoices");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (invoice.loading) return <Skeleton className="mx-auto h-64 max-w-3xl" />;
  if (invoice.error) return <ErrorState message={invoice.error} />;
  if (!invoice.data) return <p className="text-sm text-muted-foreground">Invoice not found.</p>;
  const inv = invoice.data;
  const client = clients.data.find((c) => c.id === inv.clientId);
  const review = inv.reviewStatus === "needs_review";
  const display = invoiceDisplayStatus(inv, workspace?.timezone ?? "UTC");

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/invoices" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Invoices
      </Link>
      <PageHeader
        title={inv.number ? `Invoice ${inv.number}` : "Invoice (incomplete)"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={display} />
            {inv.reviewStatus !== "needs_review" && <StatusBadge status={inv.reviewStatus} />}
            {inv.isSample && <StatusBadge status="sample" />}
            <span>Source: {inv.source}</span>
          </span>
        }
        actions={
          !review && (
            <>
              {inv.status !== "paid" && inv.status !== "void" && (
                <Button variant="outline" disabled={busy} onClick={() => action("mark_paid")}>
                  <CheckIcon /> Mark paid
                </Button>
              )}
              {inv.status !== "void" ? (
                <Button variant="ghost" disabled={busy} onClick={() => action("void")}>
                  <XIcon /> Void
                </Button>
              ) : (
                <Button variant="ghost" disabled={busy} onClick={() => action("reopen")}>
                  Reopen
                </Button>
              )}
            </>
          )
        }
      />

      {review && (
        <Alert className="mb-4 border-warning/40">
          <AlertTitle>Check the extracted details</AlertTitle>
          <AlertDescription>
            Some automatic checks didn&apos;t pass, so this invoice isn&apos;t used for reminders yet. Correct anything wrong below and
            confirm.
          </AlertDescription>
        </Alert>
      )}

      {inv.checks.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">Extraction checks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {inv.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  {c.ok ? <CheckIcon className="mt-0.5 size-4 text-success" /> : <XIcon className="mt-0.5 size-4 text-destructive" />}
                  <span className={c.ok ? "text-muted-foreground" : ""}>{c.message}</span>
                </li>
              ))}
            </ul>
            {inv.sourceDocumentId && (
              <a
                href={`/api/documents/${inv.sourceDocumentId}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
              >
                Open source document{inv.sourcePages?.length ? ` (page ${inv.sourcePages.join(", ")})` : ""} <ExternalLinkIcon className="size-3.5" />
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {review || editing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{review ? "Review and confirm" : "Edit invoice"}</CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceForm
              clients={clients.data}
              invoice={inv}
              onDone={() => setEditing(false)}
              submitLabel={review ? "Confirm invoice" : "Save changes"}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="grid gap-4 pt-6 text-sm sm:grid-cols-2">
            <Field label="Client" value={client ? <Link className="underline-offset-4 hover:underline" href={`/app/clients/${client.id}`}>{client.name}</Link> : "—"} />
            <Field label="Total" value={money(inv.totalMinor, inv.currency)} />
            <Field label="Issued" value={formatDate(inv.issueDate)} />
            <Field label="Paid" value={money(inv.paidMinor, inv.currency)} />
            <Field label="Due" value={formatDate(inv.dueDate)} />
            <Field label="Outstanding" value={<span className="font-medium">{money(outstandingOf(inv), inv.currency)}</span>} />
            <Field label="Last reminder" value={inv.lastRemindedAt ? `${inv.reminderStage} · ${formatTime(toMillis(inv.lastRemindedAt))}` : "None sent"} />
            <div className="flex items-end justify-end gap-2 sm:col-span-2">
              <Button variant="ghost" className="text-destructive" onClick={remove}>
                Delete
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
