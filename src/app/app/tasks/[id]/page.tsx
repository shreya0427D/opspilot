"use client";

import { orderBy } from "firebase/firestore";
import {
  ArrowLeftIcon,
  BotIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleIcon,
  ClockIcon,
  DatabaseIcon,
  FileTextIcon,
  Loader2Icon,
  MailIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorState, PageHeader } from "@/components/app/page-header";
import { useWsPath } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/client/api";
import { useLiveCollection, useLiveDoc, toMillis } from "@/lib/client/firestore-hooks";
import { formatTime } from "@/lib/client/format";
import { TERMINAL_TASK_STATUSES, type Step, type StepLane, type Task } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const LANE: Record<StepLane, { label: string; icon: typeof BotIcon }> = {
  orchestrator: { label: "Planner", icon: BotIcon },
  document: { label: "Documents", icon: FileTextIcon },
  data: { label: "Data", icon: DatabaseIcon },
  action: { label: "Action", icon: MailIcon },
  verification: { label: "Verification", icon: ShieldCheckIcon },
};

function StepIcon({ status }: { status: Step["status"] }) {
  const cls = "size-5 shrink-0";
  switch (status) {
    case "succeeded":
      return <CheckCircle2Icon className={cn(cls, "text-success")} />;
    case "failed":
      return <XCircleIcon className={cn(cls, "text-destructive")} />;
    case "running":
      return <Loader2Icon className={cn(cls, "animate-spin text-info motion-reduce:animate-none")} />;
    case "waiting":
    case "queued":
      return <ClockIcon className={cn(cls, "text-warning")} />;
    case "skipped":
    case "canceled":
      return <CircleDashedIcon className={cn(cls, "text-muted-foreground")} />;
    default:
      return <CircleIcon className={cn(cls, "text-muted-foreground/50")} />;
  }
}

function ReportSection({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className={cn("mb-1 text-xs font-semibold uppercase tracking-wide", tone)}>
        {title} ({items.length})
      </h3>
      <ul className="space-y-1 text-sm">
        {items.map((line, i) => (
          <li key={i} className="leading-snug">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const base = useWsPath("tasks");
  const task = useLiveDoc<Task>(base ? `${base}/${id}` : null);
  const steps = useLiveCollection<Step>(base ? `${base}/${id}/steps` : null, [orderBy("index")], "byIndex");
  const [canceling, setCanceling] = useState(false);

  // Self-healing: if a step has sat in "queued" (or past its lease) for too long, the hand-off to
  // a worker was lost. Ask the server to resume it; the server's claim makes repeats harmless.
  const [now, setNow] = useState(() => Date.now());
  const stalled = steps.data.some((s) => {
    const queuedAt = toMillis(s.queuedAt) ?? (s.status === "queued" && s.attempt === 0 ? (toMillis(s.leaseUntil) ?? 0) - 300_000 : null);
    if (s.status === "queued" && queuedAt) return now - queuedAt > 20_000;
    return (s.status === "running" || s.status === "waiting") && (toMillis(s.leaseUntil) ?? Infinity) < now;
  });
  const active = task.data && !TERMINAL_TASK_STATUSES.includes(task.data.status) && task.data.status !== "awaiting_approval";
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, [active]);
  useEffect(() => {
    if (!active || !stalled) return;
    api(`/api/tasks/${id}/resume`, { method: "POST" }).catch(() => undefined);
  }, [active, stalled, id, now]);

  if (task.loading) return <Skeleton className="mx-auto h-64 max-w-3xl" />;
  if (task.error) return <ErrorState message={task.error} />;
  if (!task.data) return <p className="text-sm text-muted-foreground">Task not found.</p>;
  const t = task.data;
  const finished = TERMINAL_TASK_STATUSES.includes(t.status);
  const report = t.report;

  async function cancel() {
    setCanceling(true);
    try {
      await api(`/api/tasks/${id}/cancel`, { method: "POST" });
      toast.success("Cancel requested");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/app/tasks" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Tasks
      </Link>
      <PageHeader
        title={t.command}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={t.status} />
            <span>Started {formatTime(toMillis(t.createdAt))}</span>
            {finished && t.finishedAt && <span>· Finished {formatTime(toMillis(t.finishedAt))}</span>}
          </span>
        }
        actions={
          !finished && (
            <Button variant="outline" onClick={cancel} disabled={canceling || t.cancelRequested}>
              {t.cancelRequested ? "Canceling…" : "Cancel task"}
            </Button>
          )
        }
      />

      {t.status === "awaiting_approval" && t.approvalId && (
        <Alert className="border-warning/40">
          <AlertTitle>Your approval is needed</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{t.summary}</span>
            <Button asChild size="sm">
              <Link href={`/app/approvals/${t.approvalId}`}>Review emails</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {t.status === "waiting_on_model" && (
        <Alert>
          <AlertTitle>Waiting for the AI service</AlertTitle>
          <AlertDescription>The model is temporarily unavailable. OpsPilot will retry automatically; nothing has been skipped.</AlertDescription>
        </Alert>
      )}

      {(report || (finished && t.summary)) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {t.summary && <p className="text-sm">{t.summary}</p>}
            {t.error && t.status !== "succeeded" && <p className="text-sm text-destructive">{t.error}</p>}
            {report && (
              <>
                <ReportSection title="Delivered" items={report.verified} tone="text-success" />
                <ReportSection title="Accepted — awaiting delivery confirmation" items={report.accepted ?? []} tone="text-info" />
                <ReportSection title="Needs your attention" items={report.needsReview} tone="text-warning" />
                <ReportSection title="Failed" items={report.failed} tone="text-destructive" />
                <ReportSection title="Skipped" items={report.skipped} tone="text-muted-foreground" />
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Execution timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {steps.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <ol className="relative space-y-4">
              {steps.data.map((s, i) => {
                const lane = LANE[s.lane];
                const LaneIcon = lane.icon;
                const outputSummary = typeof s.output?.summary === "string" ? s.output.summary : null;
                return (
                  <li key={s.id} className="relative flex gap-3">
                    {i < steps.data.length - 1 && <span className={`absolute top-6 left-2.5 h-[calc(100%-0.5rem)] w-px ${s.status === "succeeded" ? "bg-lx-gold/60" : "bg-border"}`} aria-hidden />}
                    <StepIcon status={s.status} />
                    <div className="min-w-0 flex-1 pb-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium break-words">{s.label}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <LaneIcon className="size-3" /> {lane.label}
                        </span>
                        {s.verification && <StatusBadge status={s.verification} />}
                        {s.origin === "approval" && <span className="text-xs text-muted-foreground">· after your approval</span>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span>
                          <StatusBadge status={s.status} className="mr-1" />
                        </span>
                        {s.attempt > 1 && <span>Attempt {s.attempt} of {s.maxAttempts}</span>}
                        {s.endedAt && s.startedAt && (
                          <span>{Math.max(0, Math.round(((toMillis(s.endedAt) ?? 0) - (toMillis(s.startedAt) ?? 0)) / 100) / 10)}s</span>
                        )}
                      </div>
                      {s.error && <p className="mt-1 text-xs text-destructive">{s.error}</p>}
                      {outputSummary && <p className="mt-1 text-xs text-muted-foreground">{outputSummary}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
