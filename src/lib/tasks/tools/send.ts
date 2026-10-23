import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { formatMinor } from "@/lib/domain/money";
import type { ApprovalItem, Invoice } from "@/lib/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import { emailConfig, lookupEmail, sendEmail } from "@/lib/server/email";
import { audit, recordUsage, ws } from "@/lib/server/workspace-data";
import { registerTool } from "../registry";
import { loadWorkspace } from "./shared";

// Resend keeps idempotency keys for 24 hours. Within that window a retry with the same key cannot
// produce a second email, so an interrupted send can be safely retried. Past it, we stop and ask.
const IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1000;

class TransientSendError extends Error {}

registerTool({
  name: "send_reminders",
  lane: "action",
  permission: "external",
  maxAttempts: 3,
  argsSchema: z.object({ approvalId: z.string() }),
  async run(ctx, { approvalId }) {
    const db = adminDb();
    const col = ws(ctx.workspaceId);
    const aRef = col.approvals.doc(approvalId);
    const approval = await aRef.get();
    if (!approval.exists || approval.get("taskId") !== ctx.taskId) throw new Error("Approval does not belong to this task");
    await aRef.update({ status: "executing" });

    const workspace = await loadWorkspace(ctx.workspaceId);
    const config = emailConfig();
    const items = await aRef.collection("items").where("status", "in", ["approved", "sending"]).get();
    let sent = 0;
    let failed = 0;
    let transient: string | null = null;

    for (const doc of items.docs) {
      // Claim the item: approved -> sending. Items already "sending" were interrupted earlier.
      const claim = await db.runTransaction(async (tx) => {
        const item = (await tx.get(doc.ref)).data() as ApprovalItem & { sendStartedAt?: Timestamp };
        if (item.status === "approved") {
          tx.update(doc.ref, { status: "sending", sendStartedAt: FieldValue.serverTimestamp() });
          return item;
        }
        if (item.status === "sending") {
          const started = item.sendStartedAt?.toMillis() ?? 0;
          if (Date.now() - started > IDEMPOTENCY_WINDOW_MS) {
            tx.update(doc.ref, { status: "unknown", error: "Send was interrupted and can no longer be safely retried. Check your sent mail before resending." });
            return null;
          }
          return item; // safe retry with the same idempotency key
        }
        return null;
      });
      if (!claim) continue;

      const markFailed = async (error: string) => {
        await doc.ref.update({ status: "failed", error });
        failed++;
      };

      if (claim.isSample) {
        await markFailed("Sample data is never sent");
        continue;
      }
      if (!config.ok) {
        await markFailed(config.reason);
        continue;
      }
      // Final guard: the invoice must still be unpaid right before sending.
      const inv = (await col.invoices.doc(claim.invoiceId).get()).data() as Invoice | undefined;
      if (!inv || inv.status === "paid" || inv.status === "void") {
        await markFailed(`Not sent: invoice is ${inv ? inv.status : "deleted"}`);
        continue;
      }

      const outcome = await sendEmail({
        fromName: workspace.senderName,
        to: claim.to,
        replyTo: workspace.replyToEmail,
        subject: claim.subject,
        text: claim.body,
        idempotencyKey: claim.sendKey,
      });

      if (outcome.kind === "sent") {
        await db.runTransaction(async (tx) => {
          tx.update(doc.ref, {
            status: "sent",
            providerMessageId: outcome.providerMessageId,
            sentAt: FieldValue.serverTimestamp(),
            error: null,
          });
          tx.update(col.invoices.doc(claim.invoiceId), {
            reminderStage: claim.stage,
            lastRemindedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          await audit(ctx.workspaceId, "system", "email.sent", `invoices/${claim.invoiceId}`, {
            approvalId,
            itemId: doc.id,
            providerMessageId: outcome.providerMessageId,
          }, tx);
        });
        await recordUsage(ctx.workspaceId, { emailsSent: 1 });
        sent++;
      } else if (outcome.kind === "rejected") {
        await markFailed(outcome.message);
      } else {
        // Leave the item in "sending"; the step retry will resend with the same idempotency key.
        transient = outcome.message;
      }
    }

    if (transient) throw new TransientSendError(transient);
    return {
      output: { sent, failed },
      summary: `Sent ${sent} email${sent === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`,
    };
  },
});

registerTool({
  name: "report_sends",
  lane: "verification",
  permission: "read",
  maxAttempts: 3,
  argsSchema: z.object({ approvalId: z.string() }),
  async run(ctx, { approvalId }) {
    const aRef = ws(ctx.workspaceId).approvals.doc(approvalId);
    const [approval, itemsSnap] = await Promise.all([aRef.get(), aRef.collection("items").get()]);
    const report = { verified: [] as string[], failed: [] as string[], skipped: [...((approval.get("skipped") as string[]) ?? [])], needsReview: [] as string[] };

    for (const doc of itemsSnap.docs) {
      const item = doc.data() as ApprovalItem;
      const label = `${formatMinor(item.amountDueMinor, item.currency)} reminder to ${item.to}`;
      switch (item.status) {
        case "sent": {
          // Confirm with the provider instead of trusting our own record.
          const found = item.providerMessageId ? await lookupEmail(item.providerMessageId) : null;
          if (!found) report.needsReview.push(`${label}: accepted by the provider but could not be confirmed yet`);
          else if (["bounced", "failed", "suppressed", "complained", "canceled"].includes(found.lastEvent)) {
            report.failed.push(`${label}: provider reports "${found.lastEvent}"`);
          } else report.verified.push(`${label}: provider status "${found.lastEvent}"`);
          break;
        }
        case "failed":
          report.failed.push(`${label}: ${item.error ?? "failed"}`);
          break;
        case "rejected":
          report.skipped.push(`${label}: you chose not to send it`);
          break;
        case "unknown":
        case "sending":
          report.needsReview.push(`${label}: ${item.error ?? "outcome unknown"}`);
          break;
        default:
          report.needsReview.push(`${label}: still ${item.status}`);
      }
    }
    await aRef.update({ status: "completed" });

    const anyGood = report.verified.length > 0;
    const anyBad = report.failed.length + report.needsReview.length > 0;
    return {
      output: { counts: { verified: report.verified.length, failed: report.failed.length, needsReview: report.needsReview.length } },
      report,
      verification: anyBad ? "needs_review" : "pass",
      finalStatus: anyBad ? (anyGood ? "partially_succeeded" : "failed") : "succeeded",
      summary: `${report.verified.length} confirmed sent, ${report.failed.length} failed, ${report.needsReview.length} need your attention, ${report.skipped.length} skipped.`,
    };
  },
});
