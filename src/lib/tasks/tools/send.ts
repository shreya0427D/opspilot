import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { formatMinor } from "@/lib/domain/money";
import type { ApprovalItem, Client, Invoice } from "@/lib/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import { emailConfig, lookupEmail, sendEmail } from "@/lib/server/email";
import { nextProviderStatus, normalizeEmail } from "@/lib/server/recipient";
import { checkClientRecipient } from "@/lib/server/recipient-store";
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
    let review = 0;
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
      const markReview = async (error: string) => {
        await doc.ref.update({ status: "needs_review", error });
        review++;
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
      // Final recipient guard: only an address still saved on this client, and only if it passes.
      const client = (await col.clients.doc(claim.clientId).get()).data() as Client | undefined;
      if (!client || !client.emails.some((e) => normalizeEmail(e) === normalizeEmail(claim.to))) {
        await markReview(`Needs review: ${claim.to} is no longer saved on this client`);
        continue;
      }
      const recipient = await checkClientRecipient(ctx.workspaceId, claim.to);
      if (!recipient.ok) {
        await markReview(`Needs review: ${recipient.reason}`);
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
            deliveredTo: outcome.deliveredTo,
            testMode: outcome.testMode,
            sentAt: FieldValue.serverTimestamp(),
            error: null,
          });
          // Lets delivery webhooks find this item from the provider's message id.
          tx.set(db.doc(`emailMessages/${outcome.providerMessageId}`), {
            workspaceId: ctx.workspaceId,
            approvalId,
            itemId: doc.id,
            createdAt: FieldValue.serverTimestamp(),
          });
          tx.update(col.invoices.doc(claim.invoiceId), {
            reminderStage: claim.stage,
            lastRemindedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          await audit(ctx.workspaceId, "system", outcome.testMode ? "email.sent_test" : "email.sent", `invoices/${claim.invoiceId}`, {
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
      output: { sent, failed, review },
      summary: `Sent ${sent} email${sent === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}${review ? `, ${review} need review` : ""}.`,
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
    const report = {
      verified: [] as string[],
      accepted: [] as string[],
      failed: [] as string[],
      skipped: [...((approval.get("skipped") as string[]) ?? [])],
      needsReview: [] as string[],
    };
    const TERMINAL = ["bounced", "failed", "suppressed", "complained", "canceled"];

    for (const doc of itemsSnap.docs) {
      const item = doc.data() as ApprovalItem;
      const label = item.testMode
        ? `TEST: ${formatMinor(item.amountDueMinor, item.currency)} reminder for ${item.to}, delivered to ${item.deliveredTo} (not the client)`
        : `${formatMinor(item.amountDueMinor, item.currency)} reminder to ${item.to}`;
      switch (item.status) {
        case "sent": {
          // Delivery webhooks may already have reported; otherwise ask the provider.
          let event = item.providerStatus ?? null;
          if (!event || event === "sent" || event === "delivery_delayed") {
            const found = item.providerMessageId ? await lookupEmail(item.providerMessageId) : null;
            if (found) {
              event = nextProviderStatus(event, found.lastEvent);
              await doc.ref.update({ providerStatus: event });
            }
          }
          if (event === "delivered") report.verified.push(`${label}: delivered`);
          else if (event && TERMINAL.includes(event)) report.failed.push(`${label}: provider reports "${event}"`);
          // Accepted by the provider is not proof of delivery; webhooks update the status later.
          else report.accepted.push(`${label}: accepted by the provider, delivery not confirmed yet`);
          break;
        }
        case "failed":
          report.failed.push(`${label}: ${item.error ?? "failed"}`);
          break;
        case "rejected":
          report.skipped.push(`${label}: you chose not to send it`);
          break;
        case "needs_review":
        case "unknown":
        case "sending":
          report.needsReview.push(`${label}: ${item.error ?? "outcome unknown"}`);
          break;
        default:
          report.needsReview.push(`${label}: still ${item.status}`);
      }
    }
    await aRef.update({ status: "completed" });

    const anyGood = report.verified.length + report.accepted.length > 0;
    const anyBad = report.failed.length + report.needsReview.length > 0;
    return {
      output: { counts: { verified: report.verified.length, accepted: report.accepted.length, failed: report.failed.length, needsReview: report.needsReview.length } },
      report,
      verification: anyBad ? "needs_review" : "pass",
      finalStatus: anyBad ? (anyGood ? "partially_succeeded" : "failed") : "succeeded",
      summary: `${report.verified.length} delivered, ${report.accepted.length} accepted (delivery not yet confirmed), ${report.failed.length} failed, ${report.needsReview.length} need your attention, ${report.skipped.length} skipped.`,
    };
  },
});
