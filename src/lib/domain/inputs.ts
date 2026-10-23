import { z } from "zod";
import { isIsoDate, isValidTimeZone } from "./dates";
import { isCurrencyCode } from "./money";
import { REMINDER_STAGES } from "./types";

// Request-body schemas for route handlers. Everything a client sends is validated here.

const isoDate = z.string().refine(isIsoDate, "Expected a date as YYYY-MM-DD");
const currency = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .refine(isCurrencyCode, "Unknown currency code");
const minor = z.number().int().nonnegative().max(1_000_000_000_000);
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const createWorkspaceInput = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
  senderName: z.string().trim().min(1).max(80),
  replyToEmail: z.email(),
});

export const updateWorkspaceInput = createWorkspaceInput.partial().extend({
  dailyCheck: z
    .object({ enabled: z.boolean(), hourLocal: z.number().int().min(0).max(23) })
    .optional(),
});

export const clientInput = z.object({
  name: z.string().trim().min(1).max(120),
  emails: z.array(z.email()).min(1).max(5),
  company: z.string().trim().max(120).optional(),
  defaultCurrency: currency.optional(),
});

export const invoiceInput = z
  .object({
    number: z.string().trim().min(1).max(64),
    clientId: id,
    issueDate: isoDate,
    dueDate: isoDate,
    currency,
    totalMinor: minor.positive(),
    paidMinor: minor.default(0),
  })
  .refine((v) => v.dueDate >= v.issueDate, { message: "Due date is before issue date", path: ["dueDate"] })
  .refine((v) => v.paidMinor <= v.totalMinor, { message: "Paid exceeds total", path: ["paidMinor"] });

export const invoicePatchInput = z.object({
  action: z.enum(["confirm_review", "mark_paid", "void", "reopen", "assign_client"]),
  clientId: id.optional(),
});

export const paymentInput = z.object({
  invoiceId: id.nullable(),
  amountMinor: minor.positive(),
  currency,
  date: isoDate,
  reference: z.string().trim().max(120).optional(),
});

export const paymentDecisionInput = z.object({
  decision: z.enum(["confirm", "reject"]),
  invoiceId: id.optional(),
});

export const csvImportInput = z.object({
  kind: z.enum(["clients", "payments"]),
  csv: z.string().min(1).max(1_000_000),
});

export const templateInput = z.object({
  stage: z.enum(REMINDER_STAGES),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  toneNotes: z.string().trim().max(500).default(""),
});

export const createTaskInput = z.object({
  command: z.string().trim().min(1).max(2000),
  submissionKey: z.string().uuid(),
});

export const finalizeUploadInput = z.object({
  documentId: id,
  storagePath: z.string().min(1).max(512),
  fileName: z.string().min(1).max(255),
});

export const approvalDecisionInput = z.object({
  items: z
    .array(
      z.object({
        itemId: id,
        decision: z.enum(["approve", "reject"]),
        subject: z.string().trim().min(1).max(200).optional(),
        body: z.string().trim().min(1).max(5000).optional(),
      }),
    )
    .min(1)
    .max(100),
});
