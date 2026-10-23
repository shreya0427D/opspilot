import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "ai";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  info: "bg-info/10 text-info border-info/20",
  success: "bg-success/10 text-success border-success/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  ai: "bg-transparent text-foreground border-dashed border-foreground/30",
};

const LABELS: Record<string, [string, Tone]> = {
  // tasks
  queued: ["Queued", "neutral"],
  planning: ["Planning", "info"],
  running: ["Running", "info"],
  awaiting_input: ["Needs input", "warning"],
  awaiting_approval: ["Awaiting approval", "warning"],
  waiting_on_model: ["Waiting for AI", "warning"],
  succeeded: ["Succeeded", "success"],
  partially_succeeded: ["Partially succeeded", "warning"],
  failed: ["Failed", "danger"],
  canceled: ["Canceled", "neutral"],
  // steps
  pending: ["Pending", "neutral"],
  waiting: ["Waiting", "warning"],
  skipped: ["Skipped", "neutral"],
  // invoices
  open: ["Open", "info"],
  partially_paid: ["Partly paid", "warning"],
  paid: ["Paid", "success"],
  void: ["Void", "neutral"],
  overdue: ["Overdue", "danger"],
  needs_review: ["Needs review", "warning"],
  auto_accepted: ["Auto-accepted", "success"],
  confirmed: ["Confirmed", "success"],
  // documents
  uploaded: ["Uploaded", "neutral"],
  validating: ["Validating", "info"],
  processing: ["Processing", "info"],
  processed: ["Processed", "success"],
  rejected: ["Rejected", "danger"],
  // approvals / emails
  approved: ["Approved", "info"],
  sending: ["Sending", "info"],
  sent: ["Sent", "success"],
  unknown: ["Outcome unknown", "danger"],
  // payments
  suggested: ["Suggested match", "warning"],
  unmatched: ["Unmatched", "neutral"],
  // verification
  pass: ["Verified", "success"],
  fail: ["Check failed", "danger"],
  // provenance
  ai_draft: ["AI draft", "ai"],
  sample: ["Sample", "neutral"],
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const [label, tone] = LABELS[status] ?? [status.replaceAll("_", " "), "neutral" as Tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
