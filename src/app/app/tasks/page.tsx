"use client";

import { limit, orderBy } from "firebase/firestore";
import Link from "next/link";
import { EmptyState, ErrorState, PageHeader } from "@/components/app/page-header";
import { useWsPath } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLiveCollection, toMillis } from "@/lib/client/firestore-hooks";
import { formatTime } from "@/lib/client/format";
import type { Task } from "@/lib/domain/types";

const TRIGGER: Record<Task["trigger"], string> = { user: "You", upload: "Upload", daily_check: "Daily check" };

export default function TasksPage() {
  const tasks = useLiveCollection<Task>(useWsPath("tasks"), [orderBy("createdAt", "desc"), limit(100)], "recent100");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Tasks" description="Every request OpsPilot has worked on, with a step-by-step record." />
      {tasks.error && <ErrorState message={tasks.error} />}
      {tasks.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : tasks.data.length === 0 ? (
        <EmptyState title="No tasks yet" description="Press Ctrl K and type something like “Chase overdue invoices”." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Started by</TableHead>
                <TableHead className="hidden sm:table-cell">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="max-w-80 whitespace-normal">
                    <Link href={`/app/tasks/${t.id}`} className="block truncate font-medium underline-offset-4 hover:underline" title={t.command}>
                      {t.command}
                    </Link>
                    {t.summary && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={t.summary}>{t.summary}</div>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{TRIGGER[t.trigger]}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{formatTime(toMillis(t.createdAt))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
