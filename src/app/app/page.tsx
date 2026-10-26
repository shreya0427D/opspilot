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
        <section aria-labelledby="start-title" className="rounded-xl border border-border bg-card p-6 sm:p-8">
          <h2 id="start-title" className="font-display text-2xl">Get started</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add your invoices and clients, then ask OpsPilot to chase what&apos;s overdue.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { href: "/app/documents", title: "Upload invoices", body: "PDF or images. Fields are extracted and checked." },
              { href: "/app/clients", title: "Add clients", body: "By hand or from a CSV file." },
            ].map((s, i) => (
              <Link key={s.href} href={s.href} className="group rounded-lg border border-border bg-background/60 p-4 transition-colors hover:border-lx-gold focus-visible:outline-2 focus-visible:outline-ring">
                <span className="font-display text-sm text-lx-gold-ink">{String(i + 1).padStart(2, "0")}</span>
                <div className="mt-1 font-medium">{s.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </Link>
            ))}
            <button type="button" onClick={loadSample} disabled={loadingSample} className="rounded-lg border border-dashed border-input p-4 text-left transition-colors hover:border-lx-gold disabled:opacity-60">
              <span className="font-display text-sm text-lx-gold-ink">03</span>
              <div className="mt-1 font-medium">{loadingSample ? "Loading…" : "Load sample data"}</div>
              <p className="mt-1 text-sm text-muted-foreground">Try the workflow with fake records. Sample emails are never sent.</p>
            </button>
          </div>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          {/* Headline figure: what is overdue right now */}
          <section aria-labelledby="overdue-title" className="relative overflow-hidden rounded-xl bg-lx-ink p-6 text-lx-porcelain shadow-[0_30px_60px_-35px_rgba(23,34,48,.7)]">
            <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-lx-gold-deep via-lx-gold to-transparent" />
            <div aria-hidden className="lx-guides-dark pointer-events-none absolute inset-0 opacity-60" />
            <h2 id="overdue-title" className="relative text-[11px] font-semibold uppercase tracking-[0.2em] text-lx-gold-light">Overdue</h2>
            <div className="relative mt-3 space-y-1 font-display text-[2rem] leading-tight tabular-nums break-words">
              {invoices.loading ? (
                <Skeleton className="h-9 w-40 bg-white/10" />
              ) : Object.keys(overdueTotals).length ? (
                Object.entries(overdueTotals).map(([c, m]) => <div key={c}>{money(m, c)}</div>)
              ) : (
                <div>Nothing overdue</div>
              )}
            </div>
            <p className="relative mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-lx-mist">
              {overdue.length} invoice{overdue.length === 1 ? "" : "s"} past due
              <Link href="/app/invoices?filter=overdue" className="inline-flex items-center gap-1 font-medium text-lx-gold-light underline-offset-4 hover:underline">
                View <ArrowRightIcon className="size-3.5" />
              </Link>
            </p>
          </section>
          <section aria-labelledby="open-title" className="lx-lift rounded-xl border border-border bg-card p-6">
            <h2 id="open-title" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Outstanding · all open</h2>
            <div className="mt-3 space-y-1 font-display text-[1.75rem] leading-tight tabular-nums break-words">
              {invoices.loading ? (
                <Skeleton className="h-8 w-36" />
              ) : Object.keys(openTotals).length ? (
                Object.entries(openTotals).map(([c, m]) => <div key={c}>{money(m, c)}</div>)
              ) : (
                <div>Nothing open</div>
              )}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Shown per currency, never converted.</p>
          </section>
          <section aria-labelledby="attention-title" className="lx-lift rounded-xl border border-border bg-card p-6">
            <h2 id="attention-title" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Needs your attention</h2>
            <div className="mt-3 font-display text-[2rem] leading-tight tabular-nums">{approvals.data.length + needsReview.length}</div>
            <div className="mt-3 divide-y divide-border border-t border-border text-sm">
              <Link href="/app/approvals" className="flex items-center justify-between gap-3 py-2 text-foreground/80 hover:text-foreground">
                Email batches to approve
                <span className={`rounded-full px-2 text-xs font-semibold tabular-nums leading-5 ${approvals.data.length ? "bg-lx-gold text-lx-ink" : "bg-muted text-muted-foreground"}`}>{approvals.data.length}</span>
              </Link>
              <Link href="/app/invoices?filter=needs_review" className="flex items-center justify-between gap-3 py-2 text-foreground/80 hover:text-foreground">
                Invoices to review
                <span className={`rounded-full px-2 text-xs font-semibold tabular-nums leading-5 ${needsReview.length ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>{needsReview.length}</span>
              </Link>
            </div>
          </section>
        </div>
      )}

      <section aria-labelledby="tasks-title" className="mt-8 rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-6 py-5">
          <div>
            <h2 id="tasks-title" className="font-display text-2xl">Recent tasks</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Everything OpsPilot has done or is doing, with its full history.</p>
          </div>
          <Link href="/app/tasks" className="text-sm font-medium text-lx-gold-ink underline-offset-4 hover:underline">All tasks</Link>
        </div>
        <div className="px-3 py-2 sm:px-4">
          {tasks.loading ? (
            <Skeleton className="m-3 h-16" />
          ) : tasks.data.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">No tasks yet. Press Ctrl K and tell OpsPilot what to do.</p>
          ) : (
            <ul className="divide-y divide-border">
              {tasks.data.map((t) => (
                <li key={t.id}>
                  <Link href={`/app/tasks/${t.id}`} className="flex items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-accent/45 focus-visible:outline-2 focus-visible:outline-ring">
                    <StatusBadge status={t.status} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" title={t.command}>{t.command}</span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{relativeTime(toMillis(t.createdAt))}</span>
                    <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
