"use client";

import { ArrowLeftIcon, CheckIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ErrorState, PageHeader } from "@/components/app/page-header";
import { useAuth, useWsPath } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/client/api";
import { useLiveCollection, useLiveDoc } from "@/lib/client/firestore-hooks";
import { money } from "@/lib/client/format";
import { totalsByCurrency } from "@/lib/domain/money";
import type { Approval, ApprovalItem } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Decision = { decision: "approve" | "reject"; subject: string; body: string };

export default function ApprovalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { workspace } = useAuth();
  const base = useWsPath("approvals");
  const approval = useLiveDoc<Approval>(base ? `${base}/${id}` : null);
  const items = useLiveCollection<ApprovalItem>(base ? `${base}/${id}/items` : null);
  const [edits, setEdits] = useState<Record<string, Decision>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sender, setSender] = useState<{ ok: boolean; mode?: "production" | "testing" | "blocked"; reason?: string; testRecipient?: string } | null>(null);

  useEffect(() => {
    api<{ ok: boolean; mode?: "production" | "testing" | "blocked"; reason?: string; testRecipient?: string }>("/api/email-status")
      .then(setSender)
      .catch(() => setSender({ ok: false, reason: "Couldn't check whether email sending is set up" }));
  }, []);

  const decisions = useMemo(() => {
    const out: Record<string, Decision> = {};
    for (const it of items.data) {
      out[it.id] = edits[it.id] ?? {
        // Nothing is pre-approved unless it could actually be sent.
        decision: it.isSample || !it.verification.ok || sender?.ok !== true ? "reject" : "approve",
        subject: it.subject,
        body: it.body,
      };
    }
    return out;
  }, [items.data, edits, sender]);

  if (approval.loading || items.loading) return <Skeleton className="mx-auto h-64 max-w-3xl" />;
  if (approval.error) return <ErrorState message={approval.error} />;
  if (!approval.data) return <p className="text-sm text-muted-foreground">Approval not found.</p>;

  const pending = approval.data.status === "pending";
  const approved = items.data.filter((it) => decisions[it.id]?.decision === "approve");
  const approvedTotals = totalsByCurrency(approved, (it) => ({ currency: it.currency, minor: it.amountDueMinor }));
  const set = (itemId: string, patch: Partial<Decision>) => setEdits((e) => ({ ...e, [itemId]: { ...decisions[itemId], ...patch } }));

  async function submit() {
    setBusy(true);
    try {
      await api(`/api/approvals/${id}`, {
        body: {
          items: items.data.map((it) => {
            const d = decisions[it.id];
            const changed = d.subject !== it.subject || d.body !== it.body;
            return { itemId: it.id, decision: d.decision, ...(changed ? { subject: d.subject, body: d.body } : {}) };
          }),
        },
      });
      toast.success(approved.length ? `Sending ${approved.length} email(s)…` : "All emails rejected");
      setConfirming(false);
      router.push(`/app/tasks/${approval.data!.taskId}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/app/tasks/${approval.data.taskId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Task
      </Link>
      <PageHeader
        title="Review reminder emails"
        description={
          pending
            ? "These are AI-assisted drafts. Amounts, dates and invoice numbers were inserted from your records and checked. Edit, approve or reject each one."
            : "This batch has been decided. See the task for what was actually sent."
        }
        actions={
          pending && (
            <Button onClick={() => setConfirming(true)} disabled={busy}>
              {approved.length ? `Send ${approved.length} approved` : "Reject all"}
            </Button>
          )
        }
      />

      {pending && sender && !sender.ok && (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">Emails can&apos;t be sent yet.</span> {sender.reason} You can still reject drafts.
          </AlertDescription>
        </Alert>
      )}
      {pending && sender?.mode === "testing" && (
        <Alert className="border-warning/40">
          <AlertDescription>
            <span className="font-medium">Testing mode.</span> Approved emails are delivered to {sender.testRecipient}, not to your
            clients, and are marked as tests. To email clients, verify your own domain in Resend and set EMAIL_FROM to an address on it.
          </AlertDescription>
        </Alert>
      )}

      {approval.data.skipped?.length > 0 && (
        <Alert>
          <AlertDescription>
            <span className="font-medium">Not included:</span> {approval.data.skipped.join(" · ")}
          </AlertDescription>
        </Alert>
      )}

      {items.data.map((it) => {
        const d = decisions[it.id];
        const blocked = it.isSample || !it.verification.ok;
        return (
          <Card key={it.id} className={cn(pending && d.decision === "reject" && "opacity-70")}>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
              <span className="text-sm font-medium">To {it.to}</span>
              <span className="text-sm tabular-nums text-muted-foreground">{money(it.amountDueMinor, it.currency)}</span>
              <StatusBadge status="ai_draft" />
              <StatusBadge status={it.stage} />
              {it.isSample && <StatusBadge status="sample" />}
              {!pending && <StatusBadge status={it.status === "sent" && it.providerStatus ? it.providerStatus : it.status} className="ml-auto" />}
              {!pending && it.testMode && <span className="text-xs text-warning">Test → {it.deliveredTo}</span>}
              {pending && (
                <div className="ml-auto flex gap-1" role="group" aria-label="Decision">
                  <Button
                    size="sm"
                    variant={d.decision === "approve" ? "default" : "outline"}
                    disabled={blocked || sender?.ok === false}
                    onClick={() => set(it.id, { decision: "approve" })}
                    aria-pressed={d.decision === "approve"}
                  >
                    <CheckIcon /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant={d.decision === "reject" ? "secondary" : "outline"}
                    onClick={() => set(it.id, { decision: "reject" })}
                    aria-pressed={d.decision === "reject"}
                  >
                    <XIcon /> Reject
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {it.isSample && <p className="text-xs text-muted-foreground">Sample data is never sent.</p>}
              {!it.verification.ok && (
                <p className="text-xs text-destructive">Failed checks: {it.verification.problems.join("; ")}</p>
              )}
              {it.error && <p className="text-xs text-destructive">{it.error}</p>}
              {pending ? (
                <>
                  <Input aria-label="Subject" value={d.subject} onChange={(e) => set(it.id, { subject: e.target.value })} maxLength={200} />
                  <Textarea aria-label="Body" value={d.body} onChange={(e) => set(it.id, { body: e.target.value })} rows={9} maxLength={5000} />
                  <p className="text-xs text-muted-foreground">Edits are re-checked against the invoice before sending.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">{it.subject}</p>
                  <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">{it.body}</pre>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{approved.length ? `Send ${approved.length} email${approved.length === 1 ? "" : "s"}?` : "Reject every email?"}</DialogTitle>
            <DialogDescription>
              {approved.length && sender?.mode === "testing"
                ? `Testing mode: each email will be delivered to ${sender.testRecipient} (not to the client), labelled with the client it would go to. Nothing reaches your clients.`
                : approved.length
                ? `They will be sent as “${workspace?.senderName} via OpsPilot”, with replies going to ${workspace?.replyToEmail}. Total requested: ${Object.entries(approvedTotals)
                    .map(([c, m]) => money(m, c))
                    .join(", ")}. This can't be undone.`
                : "Nothing will be sent and the task will be marked as canceled."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Submitting…" : approved.length ? "Send now" : "Reject all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
