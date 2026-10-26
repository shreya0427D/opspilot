import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The AI and the email provider are mocked; everything else (Firestore, transactions, the task
// engine, tools, approvals) runs for real against the emulator.
vi.mock("@/lib/ai/prompts", () => ({
  classifyCommand: vi.fn(),
  personalizeReminders: vi.fn(async (_ws: string, items: { ref: string }[]) => ({
    data: { notes: items.map((i) => ({ ref: i.ref, note: "Hope the launch went well." })) },
    costMicros: 5,
  })),
  extractInvoice: vi.fn(),
  answerDocumentQuestion: vi.fn(),
}));
vi.mock("@/lib/server/email", () => ({
  emailConfig: () => ({ ok: true, mode: "production", from: "reminders@ops.test" }),
  sendEmail: vi.fn(),
  lookupEmail: vi.fn(async () => ({ lastEvent: "delivered" })),
}));

const { classifyCommand } = await import("@/lib/ai/prompts");
const { sendEmail } = await import("@/lib/server/email");
const { ModelUnavailableError } = await import("@/lib/ai/gemini");
const { adminDb } = await import("@/lib/firebase/admin");
const { createTask, appendStepsAndResume, requestCancel, recoverStaleSteps, resumeStalledSteps, stepRef } = await import("@/lib/tasks/engine");
const { decideApproval } = await import("@/lib/server/services/approvals");
const { sendPlan } = await import("@/lib/tasks/plans");
import type { ApprovalItem, Invoice, Step, Task } from "@/lib/domain/types";

const db = adminDb();
const WS = "wsTest";
const ctx = { uid: "alice", email: "alice@ops.test", emailVerified: true, authTime: Date.now() / 1000, workspaceId: WS };

async function clearEmulator() {
  await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-opspilot/databases/(default)/documents", { method: "DELETE" });
}

async function seed({ sample = false } = {}) {
  const ws = db.doc(`workspaces/${WS}`);
  await ws.set({ name: "Test", ownerUid: "alice", timezone: "UTC", senderName: "Alice", replyToEmail: "alice@ops.test", dailyCheck: { enabled: false, hourLocal: 9 } });
  await ws.collection("members").doc("alice").set({ role: "owner" });
  await ws.collection("clients").doc("c1").set({ name: "Acme", normalizedName: "acme", emails: ["ap@acme-corp.com"], source: "manual", isSample: sample });
  const inv: Partial<Invoice> = {
    number: "INV-1",
    clientId: "c1",
    issueDate: "2026-08-01",
    dueDate: "2026-09-01",
    currency: "USD",
    totalMinor: 50000,
    paidMinor: 0,
    status: "open",
    reviewStatus: "confirmed",
    checks: [],
    source: "manual",
    reminderStage: null,
    lastRemindedAt: null,
    isSample: sample,
  };
  await ws.collection("invoices").doc("i1").set({ ...inv, createdAt: FieldValue.serverTimestamp() });
}

async function waitFor(taskId: string, statuses: Task["status"][], timeoutMs = 15_000): Promise<Task> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = (await db.doc(`workspaces/${WS}/tasks/${taskId}`).get()).data() as Task | undefined;
    if (t && statuses.includes(t.status)) return t;
    await new Promise((r) => setTimeout(r, 150));
  }
  const t = (await db.doc(`workspaces/${WS}/tasks/${taskId}`).get()).data() as Task | undefined;
  throw new Error(`Task ${taskId} stuck in ${t?.status}`);
}

async function steps(taskId: string) {
  return (await db.collection(`workspaces/${WS}/tasks/${taskId}/steps`).orderBy("index").get()).docs.map((d) => d.data() as Step);
}

async function items(approvalId: string) {
  const snap = await db.collection(`workspaces/${WS}/approvals/${approvalId}/items`).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ApprovalItem) }));
}

async function startCollections(key = crypto.randomUUID()) {
  const { taskId } = await createTask({ workspaceId: WS, actorUid: "alice", command: "Chase overdue", submissionKey: key, trigger: "user" });
  const task = await waitFor(taskId, ["awaiting_approval", "failed", "succeeded"]);
  return { taskId, task };
}

beforeEach(async () => {
  await clearEmulator();
  vi.mocked(classifyCommand).mockReset();
  vi.mocked(classifyCommand).mockResolvedValue({
    data: { intent: "collections", clientName: null, invoiceNumber: null, question: null, reason: "test" },
    costMicros: 1,
  });
  vi.mocked(sendEmail).mockReset();
});

afterEach(() => vi.useRealTimers());

describe("collections workflow", () => {
  it("drafts, waits for approval, sends exactly once, and reports provider-confirmed results", async () => {
    await seed();
    const { taskId, task } = await startCollections();
    expect(task.status).toBe("awaiting_approval");
    expect(sendEmail).not.toHaveBeenCalled(); // nothing goes out before approval

    const [draft] = await items(task.approvalId!);
    expect(draft.body).toContain("$500.00");
    expect(draft.body).toContain("INV-1");
    expect(draft.verification.ok).toBe(true);

    vi.mocked(sendEmail).mockResolvedValue({ kind: "sent", providerMessageId: "msg_1", deliveredTo: "ap@acme-corp.com", testMode: false });
    await decideApproval(ctx, task.approvalId!, { items: [{ itemId: draft.id, decision: "approve" }] });
    const done = await waitFor(taskId, ["succeeded", "partially_succeeded", "failed"]);

    expect(done.status).toBe("succeeded");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({ to: "ap@acme-corp.com", idempotencyKey: draft.sendKey });
    expect(done.report?.verified[0]).toContain("delivered");
    const inv = (await db.doc(`workspaces/${WS}/invoices/i1`).get()).data() as Invoice;
    expect(inv.reminderStage).toBe("firm"); // 52 days overdue with no prior reminder escalates to firm
    expect(inv.lastRemindedAt).toBeTruthy();
  });

  it("holds a client whose address can't receive email for review instead of drafting to it", async () => {
    await seed();
    await db.doc(`workspaces/${WS}/clients/c1`).update({ emails: ["ap@acme.test"] }); // reserved domain
    const { taskId, task } = await startCollections();
    expect(task.status).not.toBe("awaiting_approval");
    expect(task.approvalId ?? null).toBeNull();
    const prep = (await steps(taskId)).find((s) => s.tool === "prepare_recipients");
    const skipped = (prep?.output as { skipped: { reason: string }[] }).skipped;
    expect(skipped[0].reason).toMatch(/^Needs review: .*reserved example domain/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("re-verifies edited drafts and refuses ones that change the amount", async () => {
    await seed();
    const { task } = await startCollections();
    const [draft] = await items(task.approvalId!);
    await expect(
      decideApproval(ctx, task.approvalId!, {
        items: [{ itemId: draft.id, decision: "approve", body: draft.body.replace("$500.00", "$50.00") }],
      }),
    ).rejects.toThrow(/can't be approved/);
  });

  it("refuses to approve sample data", async () => {
    await seed({ sample: true });
    const { task } = await startCollections();
    const [draft] = await items(task.approvalId!);
    await expect(decideApproval(ctx, task.approvalId!, { items: [{ itemId: draft.id, decision: "approve" }] })).rejects.toThrow(/sample/);
  });

  it("retries a transient send failure with the same idempotency key", async () => {
    await seed();
    const { taskId, task } = await startCollections();
    const [draft] = await items(task.approvalId!);
    vi.mocked(sendEmail)
      .mockResolvedValueOnce({ kind: "retry", message: "rate limited" })
      .mockResolvedValueOnce({ kind: "sent", providerMessageId: "msg_2", deliveredTo: "ap@acme-corp.com", testMode: false });
    await decideApproval(ctx, task.approvalId!, { items: [{ itemId: draft.id, decision: "approve" }] });
    const done = await waitFor(taskId, ["succeeded", "partially_succeeded", "failed"], 20_000);
    expect(done.status).toBe("succeeded");
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const keys = vi.mocked(sendEmail).mock.calls.map((c) => c[0].idempotencyKey);
    expect(new Set(keys).size).toBe(1);
  });

  it("does not send to an invoice that was paid after drafting", async () => {
    await seed();
    const { taskId, task } = await startCollections();
    const [draft] = await items(task.approvalId!);
    await db.doc(`workspaces/${WS}/invoices/i1`).update({ status: "paid", paidMinor: 50000 });
    await expect(decideApproval(ctx, task.approvalId!, { items: [{ itemId: draft.id, decision: "approve" }] })).rejects.toThrow();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(taskId).toBeTruthy();
  });

  it("finishes without approval when nothing is overdue", async () => {
    await seed();
    await db.doc(`workspaces/${WS}/invoices/i1`).update({ dueDate: "2999-01-01" });
    const { task } = await startCollections();
    expect(task.status).toBe("succeeded");
    expect(task.approvalId).toBeNull();
  });
});

describe("engine safeguards", () => {
  it("dedupes repeated submissions of the same command", async () => {
    await seed();
    const key = crypto.randomUUID();
    const a = await createTask({ workspaceId: WS, actorUid: "alice", command: "Chase", submissionKey: key, trigger: "user" });
    const b = await createTask({ workspaceId: WS, actorUid: "alice", command: "Chase", submissionKey: key, trigger: "user" });
    expect(a.taskId).toBe(b.taskId);
    expect(b.created).toBe(false);
    await waitFor(a.taskId, ["awaiting_approval"]);
    expect((await db.collection(`workspaces/${WS}/tasks`).get()).size).toBe(1);
  });

  it("refuses an external action that did not come from an approval", async () => {
    await seed();
    const { taskId, task } = await startCollections();
    await appendStepsAndResume(WS, taskId, sendPlan(task.approvalId!), "planner");
    const done = await waitFor(taskId, ["failed", "partially_succeeded", "succeeded"]);
    const sendStep = (await steps(taskId)).find((s) => s.tool === "send_reminders")!;
    expect(sendStep.status).toBe("failed");
    expect(sendStep.error).toMatch(/approval/);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(done.status).not.toBe("succeeded");
  });

  it("cancels a task waiting for approval without sending anything", async () => {
    await seed();
    const { taskId } = await startCollections();
    await requestCancel(WS, taskId, "alice");
    const done = await waitFor(taskId, ["canceled"]);
    expect(done.status).toBe("canceled");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("pauses (does not fail or fake success) when the model is unavailable", async () => {
    await seed();
    vi.mocked(classifyCommand).mockRejectedValue(new ModelUnavailableError("down"));
    const { taskId } = await createTask({ workspaceId: WS, actorUid: "alice", command: "Chase", submissionKey: crypto.randomUUID(), trigger: "user" });
    const t = await waitFor(taskId, ["waiting_on_model"]);
    expect(t.summary).toBeNull();
    const [plan] = await steps(taskId);
    expect(plan.status).toBe("waiting");
  });

  it("resumes a step whose hand-off was lost (queued, never claimed) without duplicating work", async () => {
    await seed();
    const { taskId } = await createTask({ workspaceId: WS, actorUid: "alice", command: "Chase", submissionKey: crypto.randomUUID(), trigger: "user" });
    await waitFor(taskId, ["awaiting_approval"]);
    // Recreate the production failure: verify_drafts queued 30s ago, never claimed, approval pending.
    const all = await steps(taskId);
    const verify = all.find((s) => s.tool === "verify_drafts")!;
    const approval = all.find((s) => s.tool === "request_approval")!;
    await stepRef(WS, taskId, verify.index).update({
      status: "queued", attempt: 0, startedAt: null, endedAt: null, output: null,
      queuedAt: Timestamp.fromMillis(Date.now() - 30_000), leaseUntil: Timestamp.fromMillis(Date.now() + 270_000),
    });
    await stepRef(WS, taskId, approval.index).update({ status: "pending", attempt: 0, output: null, endedAt: null, leaseUntil: null });
    await db.doc(`workspaces/${WS}/tasks/${taskId}`).update({ status: "running" });

    expect(await resumeStalledSteps(WS, taskId)).toBe(1);
    expect(await resumeStalledSteps(WS, taskId)).toBe(0); // just re-queued: not stalled, no duplicate dispatch
    const done = await waitFor(taskId, ["awaiting_approval"]);
    expect(done.status).toBe("awaiting_approval");
    const after = await steps(taskId);
    expect(after.find((s) => s.tool === "verify_drafts")).toMatchObject({ status: "succeeded", attempt: 1 });
    expect((await db.collection(`workspaces/${WS}/approvals`).get()).size).toBe(1); // no duplicate approval batch
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("recovers a step whose worker crashed mid-run", async () => {
    await seed();
    const { taskId } = await createTask({ workspaceId: WS, actorUid: "alice", command: "Chase", submissionKey: crypto.randomUUID(), trigger: "user" });
    await waitFor(taskId, ["awaiting_approval"]);
    // Simulate a crash: put the final step back to "running" with an expired lease.
    const all = await steps(taskId);
    const last = all[all.length - 1];
    await stepRef(WS, taskId, last.index).update({ status: "running", attempt: 1, leaseUntil: Timestamp.fromMillis(Date.now() - 1000) });
    await db.doc(`workspaces/${WS}/tasks/${taskId}`).update({ status: "running" });
    expect(await recoverStaleSteps()).toBe(1);
    await waitFor(taskId, ["awaiting_approval"]);
  });

  it("marks unsupported requests as failed with an explanation", async () => {
    await seed();
    vi.mocked(classifyCommand).mockResolvedValue({
      data: { intent: "unsupported", clientName: null, invoiceNumber: null, question: null, reason: "web research" },
      costMicros: 1,
    });
    const { taskId } = await createTask({ workspaceId: WS, actorUid: "alice", command: "Research competitors", submissionKey: crypto.randomUUID(), trigger: "user" });
    const t = await waitFor(taskId, ["failed"]);
    expect(t.summary).toMatch(/isn't supported/);
  });
});
