import type { PaymentEvidence } from "./invoice-checks";

// Firestore document shapes. Paths are all scoped under workspaces/{workspaceId}/...
// Timestamps are Firestore Timestamps on the server and { seconds, nanoseconds } on the client.

export type TimestampLike = { seconds: number; nanoseconds: number } | { toMillis(): number };

export const REMINDER_STAGES = ["friendly", "firm", "final"] as const;
export type ReminderStage = (typeof REMINDER_STAGES)[number];

export type RecordSource = "manual" | "csv" | "extracted" | "sample";

export interface Workspace {
  name: string;
  ownerUid: string;
  timezone: string;
  senderName: string;
  replyToEmail: string;
  dailyCheck: { enabled: boolean; hourLocal: number };
  createdAt: TimestampLike;
}

export interface Member {
  role: "owner";
  email: string;
  joinedAt: TimestampLike;
}

export interface Client {
  name: string;
  normalizedName: string;
  emails: string[];
  company?: string;
  defaultCurrency?: string;
  source: RecordSource;
  isSample: boolean;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export const INVOICE_STATUSES = ["open", "partially_paid", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type ReviewStatus = "auto_accepted" | "needs_review" | "confirmed";

export interface InvoiceCheck {
  id: string;
  ok: boolean;
  message: string;
}

// Fields are nullable only while reviewStatus is "needs_review" (incomplete extraction).
// Confirmed/auto-accepted invoices always have every field set.
export interface Invoice {
  number: string | null;
  clientId: string | null;
  clientNameRaw?: string | null;
  /** Customer email exactly as extracted; kept even when no client could be linked. */
  clientEmailRaw?: string | null;
  /** Why the payment status was chosen (e.g. a PAID stamp on page 1). Extracted invoices only. */
  paymentEvidence?: PaymentEvidence | null;
  issueDate: string | null; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  currency: string | null; // ISO 4217
  totalMinor: number | null;
  paidMinor: number;
  status: InvoiceStatus;
  reviewStatus: ReviewStatus;
  checks: InvoiceCheck[];
  source: RecordSource;
  sourceDocumentId?: string;
  sourcePages?: number[];
  reminderStage: ReminderStage | null;
  lastRemindedAt?: TimestampLike | null;
  isSample: boolean;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export type PaymentMatchStatus = "suggested" | "confirmed" | "rejected" | "unmatched";

export interface Payment {
  amountMinor: number;
  currency: string;
  date: string;
  reference?: string;
  payerName?: string;
  source: "manual" | "csv" | "sample";
  csvImportId?: string;
  invoiceId: string | null;
  matchStatus: PaymentMatchStatus;
  matchReason?: string;
  isSample: boolean;
  createdAt: TimestampLike;
}

export type DocumentStatus =
  | "uploaded"
  | "validating"
  | "processing"
  | "processed"
  | "rejected"
  | "failed";

export interface DocumentRecord {
  fileName: string;
  storagePath: string;
  mime: string;
  sizeBytes: number;
  pageCount: number | null;
  sha256: string | null;
  status: DocumentStatus;
  error?: string;
  invoiceIds: string[];
  uploadedBy: string;
  taskId?: string;
  createdAt: TimestampLike;
}

export interface Template {
  stage: ReminderStage;
  subject: string;
  body: string;
  toneNotes: string;
  updatedAt: TimestampLike;
}

export const TASK_STATUSES = [
  "queued",
  "planning",
  "running",
  "awaiting_input",
  "awaiting_approval",
  "waiting_on_model",
  "succeeded",
  "partially_succeeded",
  "failed",
  "canceled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TERMINAL_TASK_STATUSES: TaskStatus[] = [
  "succeeded",
  "partially_succeeded",
  "failed",
  "canceled",
];

export type TaskIntent =
  | "collections"
  | "extract_documents"
  | "overdue_summary"
  | "client_lookup"
  | "document_question"
  | "unsupported";

export type TaskTrigger = "user" | "upload" | "daily_check";

export interface Task {
  command: string;
  intent: TaskIntent | null;
  trigger: TaskTrigger;
  status: TaskStatus;
  createdBy: string;
  submissionKey: string;
  params: Record<string, unknown>;
  stepCount: number;
  cancelRequested: boolean;
  costMicros: number;
  summary: string | null;
  report: TaskReport | null;
  approvalId: string | null;
  error: string | null;
  /** Automatic execution must finish by this time; reset when a person approves more work. */
  deadlineAt: TimestampLike;
  finalStatusHint: "succeeded" | "partially_succeeded" | "failed" | null;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
  finishedAt: TimestampLike | null;
}

export interface TaskReport {
  verified: string[];
  failed: string[];
  skipped: string[];
  needsReview: string[];
}

export type StepStatus =
  | "pending"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "canceled"
  | "waiting";

export type StepLane = "orchestrator" | "document" | "data" | "action" | "verification";

export interface Step {
  workspaceId: string;
  taskId: string;
  index: number;
  /** Who created the step. External tools only run from steps created by an approval decision. */
  origin: "planner" | "approval";
  tool: string;
  lane: StepLane;
  label: string;
  args: Record<string, unknown>;
  dependsOn: number[];
  dependMode: "succeeded" | "settled";
  status: StepStatus;
  attempt: number;
  maxAttempts: number;
  leaseUntil: TimestampLike | null;
  /** When the step last became runnable; used to spot lost hand-offs. */
  queuedAt?: TimestampLike | null;
  output: Record<string, unknown> | null;
  error: string | null;
  verification: "pass" | "fail" | "needs_review" | null;
  startedAt: TimestampLike | null;
  endedAt: TimestampLike | null;
}

export type ApprovalItemStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "sending"
  | "sent"
  | "failed"
  | "unknown";

export interface Approval {
  taskId: string;
  kind: "send_reminders";
  status: "pending" | "decided" | "executing" | "completed";
  itemCount: number;
  /** Invoices left out of this batch and why (e.g. no email address, reminded recently). */
  skipped: string[];
  createdAt: TimestampLike;
  decidedAt: TimestampLike | null;
}

export interface ApprovalItem {
  invoiceId: string;
  clientId: string;
  to: string;
  subject: string;
  body: string;
  stage: ReminderStage;
  currency: string;
  amountDueMinor: number;
  isSample: boolean;
  verification: { ok: boolean; problems: string[] };
  editedByUser: boolean;
  status: ApprovalItemStatus;
  sendKey: string;
  providerMessageId: string | null;
  /** Last delivery event reported by the email provider (e.g. "delivered", "bounced"). */
  providerStatus?: string | null;
  error: string | null;
  decidedAt: TimestampLike | null;
  sentAt: TimestampLike | null;
}

export interface UsageDaily {
  tasks: number;
  modelCalls: number;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  emailsSent: number;
}

export interface AuditEvent {
  actorUid: string; // "system" for scheduled/automatic actions
  action: string;
  target: string;
  metadata: Record<string, string | number | boolean | null>;
  ts: TimestampLike;
}
