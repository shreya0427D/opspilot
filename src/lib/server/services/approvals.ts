import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { z } from "zod";
import type { approvalDecisionInput, approvalItemDecisionInput } from "@/lib/domain/inputs";
import { todayInZone } from "@/lib/domain/dates";
import { verifyDraft } from "@/lib/domain/reminders";
import type { Approval, ApprovalItem, Client, Invoice, Task, Workspace } from "@/lib/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import { appendStepsAndResume, requestCancel } from "@/lib/tasks/engine";
import { sendPlan } from "@/lib/tasks/plans";
import { emailConfig } from "../email";
import { badRequest, conflict, notFound } from "../errors";
import type { WorkspaceContext } from "../session";
import { audit, ws } from "../workspace-data";

/**
 * Records the user's per-item decisions. Edited drafts are re-verified against the invoice
 * record; an item that fails verification cannot be approved. Only after this does the task
 * gain a send step (origin "approval"), which is the sole path to an external action.
 */
export async function decideApproval(
  ctx: WorkspaceContext,
  approvalId: string,
  input: z.infer<typeof approvalDecisionInput>,
) {
  const db = adminDb();
  const col = ws(ctx.workspaceId);
  const aRef = col.approvals.doc(approvalId);
  const workspace = (await col.root.get()).data() as Workspace;
  // Don't let anyone approve emails that can't be sent; say exactly what is missing instead.
  const sender = emailConfig();
  if (!sender.ok && input.items.some((i) => i.decision === "approve")) throw badRequest(sender.reason);

  const outcome = await db.runTransaction(async (tx) => {
    const aSnap = await tx.get(aRef);
    if (!aSnap.exists) throw notFound("Approval not found");
    const approval = aSnap.data() as Approval;
    if (approval.status !== "pending") throw conflict("This batch was already decided");
    const task = (await tx.get(col.tasks.doc(approval.taskId))).data() as Task;
    if (task.status !== "awaiting_approval" || task.cancelRequested) throw conflict("This task is no longer waiting for approval");

    const itemsSnap = await tx.get(aRef.collection("items"));
    const items = new Map(itemsSnap.docs.map((d) => [d.id, d]));
    const decisions = new Map(input.items.map((i) => [i.itemId, i]));
    if (decisions.size !== items.size || [...decisions.keys()].some((k) => !items.has(k))) {
      throw badRequest("Decide on every email in the batch");
    }

    // Load the records each item refers to (reads must precede writes in a transaction).
    const records = new Map<string, { inv?: Invoice; client?: Client }>();
    for (const [id, doc] of items) {
      const item = doc.data() as ApprovalItem;
      const [inv, client] = await Promise.all([tx.get(col.invoices.doc(item.invoiceId)), tx.get(col.clients.doc(item.clientId))]);
      records.set(id, { inv: inv.data() as Invoice | undefined, client: client.data() as Client | undefined });
    }

    let approved = 0;
    const problems: string[] = [];
    for (const [id, doc] of items) {
      const item = doc.data() as ApprovalItem;
      const d = decisions.get(id)!;
      if (d.decision === "reject") {
        tx.update(doc.ref, { status: "rejected", decidedAt: FieldValue.serverTimestamp() });
        continue;
      }
      const subject = d.subject ?? item.subject;
      const body = d.body ?? item.body;
      const { inv, client } = records.get(id)!;
      const verdict = checkApprovable(item, subject, body, inv, client, workspace);
      if (!verdict.ok) {
        problems.push(`${item.to}: ${verdict.problem}`);
        continue;
      }
      const check = verdict.check;
      tx.update(doc.ref, {
        status: "approved",
        subject,
        body,
        editedByUser: subject !== item.subject || body !== item.body,
        verification: check,
        decidedAt: FieldValue.serverTimestamp(),
      });
      approved++;
    }
    if (problems.length) throw badRequest(`Some emails can't be approved: ${problems.join("; ")}`);

    tx.update(aRef, { status: "decided", decidedAt: FieldValue.serverTimestamp() });
    await audit(ctx.workspaceId, ctx.uid, "approval.decided", `approvals/${approvalId}`, {
      approved,
      rejected: items.size - approved,
    }, tx);
    return { approved, taskId: approval.taskId };
  });

  if (outcome.approved > 0) {
    await appendStepsAndResume(ctx.workspaceId, outcome.taskId, sendPlan(approvalId), "approval");
  } else {
    // Everything rejected: nothing to send, so the task ends as canceled by the user.
    await aRef.update({ status: "completed" });
    await requestCancel(ctx.workspaceId, outcome.taskId, ctx.uid).catch(() => undefined);
  }
  return outcome;
}

type Verdict = { ok: true; check: ReturnType<typeof verifyDraft> } | { ok: false; problem: string };

/** The checks every approval must pass: never samples, paid/void invoices, or unverified text. */
function checkApprovable(item: ApprovalItem, subject: string, body: string, inv: Invoice | undefined, client: Client | undefined, workspace: Workspace): Verdict {
  if (item.isSample) return { ok: false, problem: "sample data can't be sent" };
  if (!inv || !client || !inv.number || !inv.currency || !inv.dueDate) return { ok: false, problem: "invoice or client no longer exists" };
  const check = verifyDraft(
    { to: item.to, subject, body },
    {
      clientName: client.name,
      invoiceNumber: inv.number,
      currency: inv.currency,
      amountDueMinor: (inv.totalMinor ?? 0) - inv.paidMinor,
      dueDate: inv.dueDate,
      today: todayInZone(workspace.timezone),
      senderName: workspace.senderName,
    },
    client.emails,
  );
  if (!check.ok || inv.status === "paid" || inv.status === "void") return { ok: false, problem: check.problems[0] ?? `invoice is ${inv.status}` };
  return { ok: true, check };
}

/**
 * Saves the decision for one email while the batch stays pending. Approving runs the same
 * checks as the batch; nothing is sent until the batch is submitted (which re-checks again).
 */
export async function decideApprovalItem(
  ctx: WorkspaceContext,
  approvalId: string,
  itemId: string,
  input: z.infer<typeof approvalItemDecisionInput>,
) {
  const col = ws(ctx.workspaceId);
  const aRef = col.approvals.doc(approvalId);
  const workspace = (await col.root.get()).data() as Workspace;
  if (input.decision === "approve") {
    const sender = emailConfig();
    if (!sender.ok) throw badRequest(sender.reason);
  }
  return adminDb().runTransaction(async (tx) => {
    const aSnap = await tx.get(aRef);
    if (!aSnap.exists) throw notFound("Approval not found");
    const approval = aSnap.data() as Approval;
    if (approval.status !== "pending") throw conflict("This batch was already decided");
    const task = (await tx.get(col.tasks.doc(approval.taskId))).data() as Task;
    if (task.status !== "awaiting_approval" || task.cancelRequested) throw conflict("This task is no longer waiting for approval");
    const itemSnap = await tx.get(aRef.collection("items").doc(itemId));
    if (!itemSnap.exists) throw notFound("Email not found in this batch");
    const item = itemSnap.data() as ApprovalItem;

    if (input.decision === "reject") {
      tx.update(itemSnap.ref, { status: "rejected", decidedAt: FieldValue.serverTimestamp() });
      return { itemId, status: "rejected" as const };
    }
    const [inv, client] = await Promise.all([tx.get(col.invoices.doc(item.invoiceId)), tx.get(col.clients.doc(item.clientId))]);
    const subject = input.subject ?? item.subject;
    const body = input.body ?? item.body;
    const verdict = checkApprovable(item, subject, body, inv.data() as Invoice | undefined, client.data() as Client | undefined, workspace);
    if (!verdict.ok) throw badRequest(`Can't approve this email: ${verdict.problem}`);
    tx.update(itemSnap.ref, {
      status: "approved",
      subject,
      body,
      editedByUser: subject !== item.subject || body !== item.body,
      verification: verdict.check,
      decidedAt: FieldValue.serverTimestamp(),
    });
    return { itemId, status: "approved" as const };
  });
}
