"use client";

import { limit, orderBy } from "firebase/firestore";
import Link from "next/link";
import { EmptyState, ErrorState, PageHeader } from "@/components/app/page-header";
import { useWsPath } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveCollection, toMillis } from "@/lib/client/firestore-hooks";
import { formatTime } from "@/lib/client/format";
import type { Approval } from "@/lib/domain/types";

const LABEL: Record<Approval["status"], string> = {
  pending: "awaiting_approval",
  decided: "approved",
  executing: "sending",
  completed: "succeeded",
};

export default function ApprovalsPage() {
  const approvals = useLiveCollection<Approval>(useWsPath("approvals"), [orderBy("createdAt", "desc"), limit(50)], "recent");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Approvals" description="Email batches OpsPilot prepared. Nothing is sent without your decision." />
      {approvals.error && <ErrorState message={approvals.error} />}
      {approvals.loading ? (
        <Skeleton className="h-32 w-full" />
      ) : approvals.data.length === 0 ? (
        <EmptyState title="Nothing to approve" description="When OpsPilot drafts reminders, they wait here for you." />
      ) : (
        <ul className="divide-y rounded-xl border">
          {approvals.data.map((a) => (
            <li key={a.id}>
              <Link href={`/app/approvals/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                <StatusBadge status={LABEL[a.status]} />
                <span className="flex-1 text-sm">
                  {a.itemCount} reminder email{a.itemCount === 1 ? "" : "s"}
                </span>
                <span className="text-xs text-muted-foreground">{formatTime(toMillis(a.createdAt))}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
