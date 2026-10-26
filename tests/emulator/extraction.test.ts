import { FieldValue } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Real Firestore + Storage emulators, real task engine and extraction tool. Only the model's
// reading of the file (and email) is mocked, so these tests exercise everything code decides.
vi.mock("@/lib/ai/prompts", () => ({
  classifyCommand: vi.fn(),
  personalizeReminders: vi.fn(async (_ws: string, items: { ref: string }[]) => ({
    data: { notes: items.map((i) => ({ ref: i.ref, note: "Hope all is well." })) },
    costMicros: 1,
  })),
  extractInvoice: vi.fn(),
  answerDocumentQuestion: vi.fn(),
}));
vi.mock("@/lib/server/email", () => ({
  emailConfig: vi.fn(() => ({ ok: true, mode: "production", from: "reminders@ops.test" })),
  sendEmail: vi.fn(),
  lookupEmail: vi.fn(async () => ({ lastEvent: "delivered" })),
}));

const { extractInvoice } = await import("@/lib/ai/prompts");
const { emailConfig, sendEmail } = await import("@/lib/server/email");
const { adminBucket, adminDb } = await import("@/lib/firebase/admin");
const { createTask } = await import("@/lib/tasks/engine");
const { decideApproval } = await import("@/lib/server/services/approvals");
import type { ExtractedInvoice } from "@/lib/domain/invoice-checks";
import type { ApprovalItem, Client, Invoice, Task } from "@/lib/domain/types";

const db = adminDb();
const WS = "wsA";
const OTHER_WS = "wsB";
const ctx = { uid: "alice", email: "alice@ops.test", emailVerified: true, authTime: Date.now() / 1000, workspaceId: WS };

const NORTHSTAR: ExtractedInvoice = {
  invoiceNumber: "OPS-QA-2026-001",
  clientName: "Northstar Design Studio",
  clientEmail: "billing@northstar-demo.com",
  issueDate: "2026-09-01",
  dueDate: "2026-09-15",
  currency: "INR",
  subtotal: "20000.00",
  tax: "3600.00",
  total: "23600.00",
  amountPaid: null,
  balanceDue: null,
  paymentMarking: "none",
  paymentMarkingText: null,
  paymentMarkingPage: null,
  lineItemAmounts: [],
  sourcePages: [1],
};

async function clearEmulator() {
  await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-opspilot/databases/(default)/documents", { method: "DELETE" });
}

async function seedWorkspace(id: string) {
  const ws = db.doc(`workspaces/${id}`);
  await ws.set({ name: id, ownerUid: "alice", timezone: "Asia/Kolkata", senderName: "QA", replyToEmail: "alice@ops.test", dailyCheck: { enabled: false, hourLocal: 9 } });
  await ws.collection("members").doc("alice").set({ role: "owner" });
}

async function waitFor(ws: string, taskId: string, statuses: Task["status"][], timeoutMs = 15_000): Promise<Task> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = (await db.doc(`workspaces/${ws}/tasks/${taskId}`).get()).data() as Task | undefined;
    if (t && statuses.includes(t.status)) return t;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Task ${taskId} did not reach ${statuses.join("/")}`);
}

/** Uploads a placeholder file to Storage, records it, and runs the real extraction task. */
async function upload(ws: string, docId: string, extracted: ExtractedInvoice | null, { repeat = false } = {}) {
  if (!repeat) vi.mocked(extractInvoice).mockResolvedValueOnce({
    data: { isInvoice: extracted !== null, multipleInvoices: false, invoice: extracted },
    costMicros: 1,
  } as Awaited<ReturnType<typeof extractInvoice>>);
  const path = `workspaces/${ws}/uploads/${docId}/invoice.pdf`;
  if (repeat) {
    const { taskId } = await createTask({
      workspaceId: ws, actorUid: "alice", command: "Extract", submissionKey: `upload-again:${docId}`,
      trigger: "upload", intent: "extract_documents", params: { documentIds: [docId] },
    });
    await waitFor(ws, taskId, ["succeeded", "partially_succeeded", "failed"]);
    return (await db.doc(`workspaces/${ws}/invoices/inv_${docId}`).get()).data() as Invoice | undefined;
  }
  await adminBucket().file(path).save(Buffer.from("%PDF-1.4 placeholder"), { contentType: "application/pdf" });
  await db.doc(`workspaces/${ws}/documents/${docId}`).set({
    fileName: `${docId}.pdf`, storagePath: path, mime: "application/pdf", sizeBytes: 20, pageCount: 1, sha256: docId,
    status: "processing", invoiceIds: [], uploadedBy: "alice", createdAt: FieldValue.serverTimestamp(),
  });
  const { taskId } = await createTask({
    workspaceId: ws, actorUid: "alice", command: "Extract", submissionKey: `upload:${docId}`,
    trigger: "upload", intent: "extract_documents", params: { documentIds: [docId] },
  });
  await waitFor(ws, taskId, ["succeeded", "partially_succeeded", "failed"]);
  return (await db.doc(`workspaces/${ws}/invoices/inv_${docId}`).get()).data() as Invoice | undefined;
}

const clientsIn = async (ws: string) =>
  (await db.collection(`workspaces/${ws}/clients`).get()).docs.map((d) => ({ id: d.id, ...(d.data() as Client) }));

async function chase(ws = WS) {
  const { taskId } = await createTask({ workspaceId: ws, actorUid: "alice", command: "Chase", submissionKey: crypto.randomUUID(), trigger: "user", intent: "collections" });
  return waitFor(ws, taskId, ["awaiting_approval", "succeeded", "failed"]);
}

beforeEach(async () => {
  await clearEmulator();
  vi.mocked(sendEmail).mockReset();
  vi.mocked(extractInvoice).mockReset();
  vi.mocked(emailConfig).mockReturnValue({ ok: true, mode: "production", from: "reminders@ops.test" });
  await seedWorkspace(WS);
  await seedWorkspace(OTHER_WS);
});

describe("invoices for customers that aren't saved yet", () => {
  it("creates the client from a valid invoice and the overdue invoice reaches reminder drafting", async () => {
    const inv = await upload(WS, "d1", NORTHSTAR);
    const clients = await clientsIn(WS);
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({ name: "Northstar Design Studio", emails: ["billing@northstar-demo.com"], source: "extracted" });
    expect(inv).toMatchObject({ reviewStatus: "auto_accepted", clientId: clients[0].id, clientEmailRaw: "billing@northstar-demo.com" });

    const task = await chase();
    expect(task.status).toBe("awaiting_approval");
    const items = (await db.collection(`workspaces/${WS}/approvals/${task.approvalId}/items`).get()).docs.map((d) => d.data() as ApprovalItem);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ to: "billing@northstar-demo.com", amountDueMinor: 2360000 });
    expect(items[0].body).toContain("₹23,600.00");
    expect(items[0].body).toContain("OPS-QA-2026-001");
    expect(sendEmail).not.toHaveBeenCalled(); // drafting never sends
  });

  it("links to an existing client with the same email instead of creating another", async () => {
    await db.doc(`workspaces/${WS}/clients/existing`).set({ name: "Northstar", normalizedName: "northstar", emails: ["billing@northstar-demo.com"], source: "manual", isSample: false });
    const inv = await upload(WS, "d2", NORTHSTAR);
    expect(inv?.clientId).toBe("existing");
    expect(await clientsIn(WS)).toHaveLength(1);
  });

  it("two invoices for the same new customer, and a retried upload, create one client and one invoice each", async () => {
    await upload(WS, "d3", NORTHSTAR);
    await upload(WS, "d4", { ...NORTHSTAR, invoiceNumber: "OPS-QA-2026-099" });
    await upload(WS, "d3", NORTHSTAR, { repeat: true }); // extraction retried for the same document
    expect(extractInvoice).toHaveBeenCalledTimes(2); // the retry didn't re-read an already-processed file
    expect(await clientsIn(WS)).toHaveLength(1);
    expect((await db.collection(`workspaces/${WS}/invoices`).get()).size).toBe(2);
  });

  it("a similar name with a different email goes to review and creates nothing", async () => {
    await db.doc(`workspaces/${WS}/clients/existing`).set({ name: "Northstar Design Studio", normalizedName: "northstar design studio", emails: ["ap@northstar.example"], source: "manual", isSample: false });
    const inv = await upload(WS, "d5", NORTHSTAR);
    expect(inv).toMatchObject({ reviewStatus: "needs_review", clientId: null, clientEmailRaw: "billing@northstar-demo.com" });
    expect(await clientsIn(WS)).toHaveLength(1);
  });

  it("a missing customer email keeps the name and goes to review without inventing a client", async () => {
    const inv = await upload(WS, "d6", { ...NORTHSTAR, clientEmail: null });
    expect(inv).toMatchObject({ reviewStatus: "needs_review", clientId: null, clientNameRaw: "Northstar Design Studio", clientEmailRaw: null });
    expect(await clientsIn(WS)).toHaveLength(0);
  });

  it("an invoice failing other checks doesn't auto-create the client but keeps the details for review", async () => {
    const inv = await upload(WS, "d7", { ...NORTHSTAR, total: "26000.00" }); // arithmetic mismatch
    expect(inv?.reviewStatus).toBe("needs_review");
    expect(inv?.checks.find((c) => c.id === "client")?.message).toMatch(/not created automatically/);
    expect(await clientsIn(WS)).toHaveLength(0);
  });

  it("a client created in one workspace is invisible to another", async () => {
    await upload(WS, "d8", NORTHSTAR);
    expect(await clientsIn(WS)).toHaveLength(1);
    expect(await clientsIn(OTHER_WS)).toHaveLength(0);
    const other = await chase(OTHER_WS);
    expect(other.approvalId).toBeNull(); // nothing to chase in the other workspace
  });
});

describe("paid invoices never get reminders", () => {
  it("a PAID stamp with no amount-paid line is stored as paid and is not chased", async () => {
    const inv = await upload(WS, "p1", { ...NORTHSTAR, paymentMarking: "paid", paymentMarkingText: "PAID", paymentMarkingPage: 1 });
    expect(inv).toMatchObject({ status: "paid", reviewStatus: "auto_accepted", paidMinor: 2360000 });
    expect(inv?.paymentEvidence).toMatchObject({ marking: "paid", text: "PAID", page: 1 });
    const task = await chase();
    expect(task.approvalId).toBeNull();
  });

  it("a PAID stamp contradicted by a balance due goes to review and is not chased", async () => {
    const inv = await upload(WS, "p2", { ...NORTHSTAR, paymentMarking: "paid", balanceDue: "23600.00" });
    expect(inv?.reviewStatus).toBe("needs_review");
    expect((await chase()).approvalId).toBeNull();
  });

  it("a partially paid overdue invoice is chased for the remaining balance only", async () => {
    await upload(WS, "p3", { ...NORTHSTAR, paymentMarking: "partially_paid", amountPaid: "10000.00" });
    const task = await chase();
    const [item] = (await db.collection(`workspaces/${WS}/approvals/${task.approvalId}/items`).get()).docs.map((d) => d.data() as ApprovalItem);
    expect(item.amountDueMinor).toBe(1360000);
  });

  it("a not-yet-due invoice is not chased", async () => {
    await upload(WS, "p4", { ...NORTHSTAR, issueDate: "2026-10-20", dueDate: "2999-11-05" });
    expect((await chase()).approvalId).toBeNull();
  });
});

describe("email safeguards", () => {
  async function draftOne() {
    await upload(WS, "e1", NORTHSTAR);
    const task = await chase();
    const [doc] = (await db.collection(`workspaces/${WS}/approvals/${task.approvalId}/items`).get()).docs;
    return { task, itemId: doc.id };
  }

  it("refuses approval with an actionable reason when the sender isn't configured", async () => {
    const { task, itemId } = await draftOne();
    vi.mocked(emailConfig).mockReturnValue({ ok: false, mode: "blocked", reason: "EMAIL_FROM uses gmail.com, which can't be verified in Resend" });
    await expect(decideApproval(ctx, task.approvalId!, { items: [{ itemId, decision: "approve" }] })).rejects.toThrow(/gmail\.com/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a provider rejection is reported as failed, never as success", async () => {
    const { task, itemId } = await draftOne();
    vi.mocked(sendEmail).mockResolvedValue({ kind: "rejected", message: "The from address domain is not verified" });
    await decideApproval(ctx, task.approvalId!, { items: [{ itemId, decision: "approve" }] });
    const done = await waitFor(WS, task.approvalId!.replace(/^a_/, ""), ["succeeded", "partially_succeeded", "failed"]);
    expect(done.status).toBe("failed");
    expect(done.report?.verified).toHaveLength(0);
    expect(done.report?.failed[0]).toMatch(/not verified/);
    const item = (await db.doc(`workspaces/${WS}/approvals/${task.approvalId}/items/${itemId}`).get()).data() as ApprovalItem;
    expect(item.status).toBe("failed");
  });
});
