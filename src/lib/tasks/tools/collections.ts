import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { ModelOutputError } from "@/lib/ai/gemini";
import { personalizeReminders } from "@/lib/ai/prompts";
import { daysOverdue, todayInZone } from "@/lib/domain/dates";
import { matchClient } from "@/lib/domain/matching";
import { formatMinor, totalsByCurrency } from "@/lib/domain/money";
import {
  DEFAULT_TEMPLATES,
  factValues,
  nextStage,
  renderTemplate,
  verifyDraft,
  type ReminderFacts,
} from "@/lib/domain/reminders";
import type { ApprovalItem, Client, Invoice, ReminderStage, Template } from "@/lib/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import { AppError } from "@/lib/server/errors";
import { ws } from "@/lib/server/workspace-data";
import { registerTool } from "../registry";
import { loadClients, loadWorkspace, outstanding, type OverdueItem } from "./shared";

const RECENT_REMINDER_MS = 3 * 24 * 60 * 60 * 1000;
const DAILY_CHECK_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
registerTool({
  name: "find_overdue",
  lane: "data",
  permission: "read",
  maxAttempts: 3,
  argsSchema: z.object({
    clientName: z.string().nullable(),
    invoiceNumber: z.string().nullable(),
    dailyCheck: z.boolean().default(false),
  }),
  async run(ctx, args) {
    const workspace = await loadWorkspace(ctx.workspaceId);
    const today = todayInZone(workspace.timezone);
    const snap = await ws(ctx.workspaceId).invoices.where("status", "in", ["open", "partially_paid"]).get();

    let clientFilter: string | null = null;
    if (args.clientName) {
      const match = matchClient({ name: args.clientName }, await loadClients(ctx.workspaceId));
      if (match.kind === "none") throw new AppError(404, "client_not_found", `No saved client matches "${args.clientName}"`);
      if (match.kind === "ambiguous") throw new AppError(409, "client_ambiguous", `Several clients match "${args.clientName}". Use the full name.`);
      clientFilter = match.clientId;
    }

    let needsReview = 0;
    const items: OverdueItem[] = [];
    for (const doc of snap.docs) {
      const inv = doc.data() as Invoice;
      if (inv.reviewStatus === "needs_review") {
        needsReview++;
        continue;
      }
      if (!inv.dueDate || !inv.currency || !inv.number) continue;
      // Defense in depth: a PAID marking is never chased unless a person reviewed and confirmed it.
      if (inv.paymentEvidence?.marking === "paid" && inv.reviewStatus !== "confirmed") continue;
      if (clientFilter && inv.clientId !== clientFilter) continue;
      if (args.invoiceNumber && inv.number.toLowerCase() !== args.invoiceNumber.toLowerCase()) continue;
      const late = daysOverdue(inv.dueDate, today);
      if (late <= 0 || outstanding(inv) <= 0) continue;
      items.push({
        invoiceId: doc.id,
        number: inv.number,
        clientId: inv.clientId,
        currency: inv.currency,
        outstandingMinor: outstanding(inv),
        dueDate: inv.dueDate,
        daysOverdue: late,
        reminderStage: inv.reminderStage,
        lastRemindedAtMs: inv.lastRemindedAt && "toMillis" in inv.lastRemindedAt ? inv.lastRemindedAt.toMillis() : null,
        isSample: inv.isSample,
      });
    }
    items.sort((a, b) => b.daysOverdue - a.daysOverdue);
    const totals = totalsByCurrency(items, (i) => ({ currency: i.currency, minor: i.outstandingMinor }));
    const totalsText = Object.entries(totals).map(([c, m]) => formatMinor(m, c)).join(", ") || "nothing";
    return {
      output: { today, items, totals, needsReview, dailyCheck: args.dailyCheck },
      verification: "pass",
      summary: `${items.length} overdue invoice${items.length === 1 ? "" : "s"} (${totalsText})${needsReview ? `; ${needsReview} awaiting your review were not included` : ""}.`,
    };
  },
});

// ---------------------------------------------------------------------------------------------
interface ReadyItem extends OverdueItem {
  clientId: string;
  clientName: string;
  to: string;
  allowedEmails: string[];
}

registerTool({
  name: "prepare_recipients",
  lane: "data",
  permission: "read",
  maxAttempts: 3,
  argsSchema: z.object({}),
  async run(ctx) {
    const found = ctx.deps[ctx.step.dependsOn[0]] as { items: OverdueItem[]; dailyCheck: boolean };
    const clients = new Map((await loadClients(ctx.workspaceId)).map((c) => [c.id, c]));
    const window = found.dailyCheck ? DAILY_CHECK_REMINDER_MS : RECENT_REMINDER_MS;
    const ready: ReadyItem[] = [];
    const skipped: { invoiceId: string; number: string; reason: string }[] = [];

    for (const item of found.items) {
      const client = item.clientId ? clients.get(item.clientId) : undefined;
      if (!client) {
        skipped.push({ invoiceId: item.invoiceId, number: item.number, reason: "Not linked to a client" });
      } else if (client.emails.length === 0) {
        skipped.push({ invoiceId: item.invoiceId, number: item.number, reason: `${client.name} has no email address` });
      } else if (item.lastRemindedAtMs && Date.now() - item.lastRemindedAtMs < window) {
        skipped.push({ invoiceId: item.invoiceId, number: item.number, reason: "Reminded recently" });
      } else {
        ready.push({ ...item, clientId: client.id, clientName: client.name, to: client.emails[0], allowedEmails: client.emails });
      }
    }
    return {
      output: { ready, skipped, today: (found as { today?: string }).today },
      verification: skipped.length ? "needs_review" : "pass",
      summary: `${ready.length} ready to remind${skipped.length ? `, ${skipped.length} skipped` : ""}.`,
    };
  },
});

// ---------------------------------------------------------------------------------------------
export interface Draft {
  ref: string;
  invoiceId: string;
  clientId: string;
  number: string;
  to: string;
  allowedEmails: string[];
  subject: string;
  body: string;
  stage: ReminderStage;
  currency: string;
  amountDueMinor: number;
  isSample: boolean;
}

registerTool({
  name: "draft_reminders",
  lane: "action",
  permission: "draft",
  maxAttempts: 3,
  argsSchema: z.object({}),
  async run(ctx) {
    const prepared = ctx.deps[ctx.step.dependsOn[0]] as { ready: ReadyItem[]; skipped: unknown[]; today: string };
    if (prepared.ready.length === 0) {
      return { output: { drafts: [], skipped: prepared.skipped }, summary: "Nothing to draft." };
    }
    const workspace = await loadWorkspace(ctx.workspaceId);
    const templateSnap = await ws(ctx.workspaceId).templates.get();
    const templates = new Map(templateSnap.docs.map((d) => [d.id, d.data() as Template]));
    const templateFor = (stage: ReminderStage) => templates.get(stage) ?? { ...DEFAULT_TEMPLATES[stage], stage };

    const withStage = prepared.ready.map((item, i) => ({
      item,
      ref: `r${i}`,
      stage: nextStage(item.reminderStage, item.daysOverdue),
    }));

    // The model writes only an opening sentence per email; facts are inserted below by code.
    let notes = new Map<string, string>();
    let costMicros = 0;
    let personalization = "model";
    try {
      const res = await personalizeReminders(
        ctx.workspaceId,
        withStage.map(({ item, ref, stage }) => ({ ref, clientName: item.clientName, stage, toneNotes: templateFor(stage).toneNotes })),
      );
      notes = new Map(res.data.notes.map((n) => [n.ref, n.note]));
      costMicros = res.costMicros;
    } catch (err) {
      if (!(err instanceof ModelOutputError)) throw err;
      personalization = "skipped (model output unusable)";
    }

    const drafts: Draft[] = withStage.map(({ item, ref, stage }) => {
      const tpl = templateFor(stage);
      const facts: ReminderFacts = {
        clientName: item.clientName,
        invoiceNumber: item.number,
        currency: item.currency,
        amountDueMinor: item.outstandingMinor,
        dueDate: item.dueDate,
        today: prepared.today,
        senderName: workspace.senderName,
      };
      const values = factValues(facts);
      return {
        ref,
        invoiceId: item.invoiceId,
        clientId: item.clientId,
        number: item.number,
        to: item.to,
        allowedEmails: item.allowedEmails,
        subject: renderTemplate(tpl.subject, values, ""),
        body: renderTemplate(tpl.body, values, notes.get(ref) ?? ""),
        stage,
        currency: item.currency,
        amountDueMinor: item.outstandingMinor,
        isSample: item.isSample,
      };
    });
    return {
      output: { drafts, skipped: prepared.skipped, personalization, today: prepared.today },
      costMicros,
      summary: `Drafted ${drafts.length} email${drafts.length === 1 ? "" : "s"}.`,
    };
  },
});

// ---------------------------------------------------------------------------------------------
registerTool({
  name: "verify_drafts",
  lane: "verification",
  permission: "read",
  maxAttempts: 3,
  argsSchema: z.object({}),
  async run(ctx) {
    const drafted = ctx.deps[ctx.step.dependsOn[0]] as { drafts: Draft[]; skipped: unknown[]; today: string };
    const workspace = await loadWorkspace(ctx.workspaceId);
    const col = ws(ctx.workspaceId);
    const checked = [];
    for (const d of drafted.drafts) {
      // Re-read the records: they may have changed while the task ran.
      const [invSnap, clientSnap] = await Promise.all([col.invoices.doc(d.invoiceId).get(), col.clients.doc(d.clientId).get()]);
      const inv = invSnap.data() as Invoice | undefined;
      const client = clientSnap.data() as Client | undefined;
      const problems: string[] = [];
      if (!inv || !client || !inv.number || !inv.currency || !inv.dueDate) problems.push("Invoice or client no longer exists");
      else if (inv.status === "paid" || inv.status === "void") problems.push(`Invoice is now ${inv.status}`);
      else {
        const facts: ReminderFacts = {
          clientName: client.name,
          invoiceNumber: inv.number,
          currency: inv.currency,
          amountDueMinor: outstanding(inv),
          dueDate: inv.dueDate,
          today: todayInZone(workspace.timezone),
          senderName: workspace.senderName,
        };
        problems.push(...verifyDraft(d, facts, client.emails).problems);
      }
      checked.push({ ...d, verification: { ok: problems.length === 0, problems } });
    }
    const failed = checked.filter((c) => !c.verification.ok).length;
    return {
      output: { drafts: checked, skipped: drafted.skipped },
      verification: failed ? "needs_review" : "pass",
      summary: failed ? `${failed} draft(s) failed checks and are flagged.` : "All drafts match their invoice records.",
    };
  },
});

// ---------------------------------------------------------------------------------------------
type CheckedDraft = Draft & { verification: { ok: boolean; problems: string[] } };

export const sendKeyFor = (approvalId: string, itemId: string) =>
  createHash("sha256").update(`${approvalId}:${itemId}`).digest("hex").slice(0, 40);

registerTool({
  name: "request_approval",
  lane: "action",
  permission: "draft",
  maxAttempts: 3,
  argsSchema: z.object({}),
  async run(ctx) {
    const verified = ctx.deps[ctx.step.dependsOn[0]] as {
      drafts: CheckedDraft[];
      skipped: { number: string; reason: string }[];
    };
    const skippedLines = verified.skipped.map((s) => `${s.number}: ${s.reason}`);
    if (verified.drafts.length === 0) {
      return {
        output: { approvalId: null },
        summary: "No reminders to send right now.",
        report: { verified: ["No overdue invoices needed a reminder."], failed: [], skipped: skippedLines, needsReview: [] },
        finalStatus: "succeeded",
      };
    }

    // Deterministic ID: a retried step overwrites its own pending approval instead of creating another.
    const approvalId = `a_${ctx.taskId}`;
    const db = adminDb();
    const aRef = ws(ctx.workspaceId).approvals.doc(approvalId);
    const batch = db.batch();
    batch.set(aRef, {
      taskId: ctx.taskId,
      kind: "send_reminders",
      status: "pending",
      itemCount: verified.drafts.length,
      skipped: skippedLines,
      createdAt: FieldValue.serverTimestamp(),
      decidedAt: null,
    });
    for (const d of verified.drafts) {
      const item: ApprovalItem = {
        invoiceId: d.invoiceId,
        clientId: d.clientId,
        to: d.to,
        subject: d.subject,
        body: d.body,
        stage: d.stage,
        currency: d.currency,
        amountDueMinor: d.amountDueMinor,
        isSample: d.isSample,
        verification: d.verification,
        editedByUser: false,
        status: "pending",
        sendKey: sendKeyFor(approvalId, d.ref),
        providerMessageId: null,
        error: null,
        decidedAt: null,
        sentAt: null,
      };
      batch.set(aRef.collection("items").doc(d.ref), item);
    }
    batch.update(ws(ctx.workspaceId).tasks.doc(ctx.taskId), { approvalId });
    await batch.commit();

    const flagged = verified.drafts.filter((d) => !d.verification.ok).length;
    const amount = Object.entries(totalsByCurrency(verified.drafts, (d) => ({ currency: d.currency, minor: d.amountDueMinor })))
      .map(([c, m]) => formatMinor(m, c))
      .join(", ");
    return {
      output: { approvalId, itemCount: verified.drafts.length, skipped: skippedLines },
      pause: "awaiting_approval",
      summary: `${verified.drafts.length} reminder${verified.drafts.length === 1 ? "" : "s"} covering ${amount} ${verified.drafts.length === 1 ? "is" : "are"} waiting for your approval${flagged ? ` (${flagged} flagged)` : ""}. Nothing has been sent.`,
    };
  },
});
