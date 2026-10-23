"use client";

import { limit, orderBy, where } from "firebase/firestore";
import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useRunCommand } from "@/components/app/command-bar";
import { ErrorState, PageHeader } from "@/components/app/page-header";
import { useAuth, useWsPath } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/client/api";
import { useLiveCollection, toMillis } from "@/lib/client/firestore-hooks";
import { invoiceDisplayStatus, money, outstandingOf, relativeTime } from "@/lib/client/format";
import { totalsByCurrency } from "@/lib/domain/money";
import type { Approval, Invoice, Task } from "@/lib/domain/types";

export default function DashboardPage() {
  const { workspace } = useAuth();
  const invoices = useLiveCollection<Invoice>(useWsPath("invoices"));
  const tasks = useLiveCollection<Task>(useWsPath("tasks"), [orderBy("createdAt", "desc"), limit(6)], "recent");
  const approvals = useLiveCollection<Approval>(useWsPath("approvals"), [where("status", "==", "pending")], "pending");
  const { run, busy } = useRunCommand();
  const [loadingSample, setLoadingSample] = useState(false);

  const tz = workspace?.timezone ?? "UTC";
  const overdue = invoices.data.filter((i) => invoiceDisplayStatus(i, tz) === "overdue");
  const open = invoices.data.filter((i) => (i.status === "open" || i.status === "partially_paid") && i.reviewStatus !== "needs_review");
  const needsReview = invoices.data.filter((i) => i.reviewStatus === "needs_review");
  const overdueTotals = totalsByCurrency(overdue, (i) => ({ currency: i.currency!, minor: outstandingOf(i) }));
  const openTotals = totalsByCurrency(open, (i) => ({ currency: i.currency!, minor: outstandingOf(i) }));
  const isEmpty = !invoices.loading && invoices.data.length === 0;

  async function loadSample() {
    setLoadingSample(true);
    try {
      await api("/api/sample", { method: "POST" });
      toast.success("Sample data loaded. It's labelled and can never be emailed.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingSample(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={workspace ? `${workspace.name}` : "Dashboard"}
        description="Your receivables at a glance. Numbers come straight from your records."
        actions={
          overdue.length > 0 && (
            <Button onClick={() => run("Chase all overdue invoices")} disabled={busy}>
              <SparklesIcon /> Chase overdue invoices
            </Button>
          )
        }
      />
      {invoices.error && <ErrorState message={invoices.error} />}

      {isEmpty ? (
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>Add your invoices and clients, then ask OpsPilot to chase what&apos;s overdue.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Link href="/app/documents" className="rounded-lg border p-4 hover:bg-muted/50">
              <div className="font-medium">Upload invoices</div>
              <p className="mt-1 text-sm text-muted-foreground">PDF or images. Fields are extracted and checked.</p>
            </Link>
            <Link href="/app/clients" className="rounded-lg border p-4 hover:bg-muted/50">
              <div className="font-medium">Add clients</div>
              <p className="mt-1 text-sm text-muted-foreground">By hand or from a CSV file.</p>
            </Link>
            <button type="button" onClick={loadSample} disabled={loadingSample} className="rounded-lg border p-4 text-left hover:bg-muted/50 disabled:opacity-60">
              <div className="font-medium">{loadingSample ? "Loading…" : "Load sample data"}</div>
              <p className="mt-1 text-sm text-muted-foreground">Try the workflow with fake records. Sample emails are never sent.</p>
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Overdue</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {invoices.loading ? <Skeleton className="h-7 w-28" /> : Object.keys(overdueTotals).length ? Object.entries(overdueTotals).map(([c, m]) => <div key={c}>{money(m, c)}</div>) : "Nothing"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {overdue.length} invoice{overdue.length === 1 ? "" : "s"} past due ·{" "}
              <Link href="/app/invoices?filter=overdue" className="underline-offset-4 hover:underline">View</Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Outstanding (all open)</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {invoices.loading ? <Skeleton className="h-7 w-28" /> : Object.keys(openTotals).length ? Object.entries(openTotals).map(([c, m]) => <div key={c}>{money(m, c)}</div>) : "Nothing"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Per currency. Never converted.</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Needs your attention</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{approvals.data.length + needsReview.length}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Link href="/app/approvals" className="flex justify-between text-muted-foreground hover:text-foreground">
                Email batches to approve <span className="tabular-nums">{approvals.data.length}</span>
              </Link>
              <Link href="/app/invoices?filter=needs_review" className="flex justify-between text-muted-foreground hover:text-foreground">
                Invoices to review <span className="tabular-nums">{needsReview.length}</span>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent tasks</CardTitle>
          <CardDescription>Everything OpsPilot has done or is doing, with its full history.</CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.loading ? (
            <Skeleton className="h-16 w-full" />
          ) : tasks.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet. Press Ctrl K and tell OpsPilot what to do.</p>
          ) : (
            <ul className="divide-y">
              {tasks.data.map((t) => (
                <li key={t.id}>
                  <Link href={`/app/tasks/${t.id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/40">
                    <StatusBadge status={t.status} />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.command}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{relativeTime(toMillis(t.createdAt))}</span>
                    <ArrowRightIcon className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
