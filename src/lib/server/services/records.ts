import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { z } from "zod";
import { normalizeName } from "@/lib/domain/matching";
import type { clientInput, invoiceInput, paymentInput } from "@/lib/domain/inputs";
import type { Client, Invoice, Payment } from "@/lib/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import { badRequest, conflict, notFound } from "../errors";
import type { WorkspaceContext } from "../session";
import { audit, ws } from "../workspace-data";

const now = () => FieldValue.serverTimestamp();

// ---------------- Clients ----------------

export async function createClient(ctx: WorkspaceContext, input: z.infer<typeof clientInput>) {
  const ref = ws(ctx.workspaceId).clients.doc();
  const normalizedName = normalizeName(input.name);
  const existing = await ws(ctx.workspaceId).clients.where("normalizedName", "==", normalizedName).limit(1).get();
  if (!existing.empty) throw conflict(`A client named "${input.name}" already exists`);
  await ref.set({
    ...input,
    emails: input.emails.map((e) => e.toLowerCase()),
    normalizedName,
    source: "manual",
    isSample: false,
    createdAt: now(),
    updatedAt: now(),
  });
  await audit(ctx.workspaceId, ctx.uid, "client.created", `clients/${ref.id}`);
  return ref.id;
}

export async function updateClient(ctx: WorkspaceContext, id: string, input: z.infer<typeof clientInput>) {
  const ref = ws(ctx.workspaceId).clients.doc(id);
  if (!(await ref.get()).exists) throw notFound("Client not found");
  await ref.update({
    ...input,
    emails: input.emails.map((e) => e.toLowerCase()),
    normalizedName: normalizeName(input.name),
    updatedAt: now(),
  });
  await audit(ctx.workspaceId, ctx.uid, "client.updated", `clients/${id}`);
}

export async function deleteClient(ctx: WorkspaceContext, id: string) {
  const col = ws(ctx.workspaceId);
  const linked = await col.invoices.where("clientId", "==", id).limit(1).get();
  if (!linked.empty) throw conflict("This client has invoices. Delete or reassign them first.");
  await col.clients.doc(id).delete();
  await audit(ctx.workspaceId, ctx.uid, "client.deleted", `clients/${id}`);
}

// ---------------- Invoices ----------------

async function assertClient(ctx: WorkspaceContext, clientId: string) {
  if (!(await ws(ctx.workspaceId).clients.doc(clientId).get()).exists) throw badRequest("Unknown client");
}

function statusFor(totalMinor: number, paidMinor: number): Invoice["status"] {
  if (paidMinor >= totalMinor) return "paid";
  return paidMinor > 0 ? "partially_paid" : "open";
}

export async function createInvoice(ctx: WorkspaceContext, input: z.infer<typeof invoiceInput>) {
  await assertClient(ctx, input.clientId);
  const col = ws(ctx.workspaceId);
  const dupe = await col.invoices.where("number", "==", input.number).limit(1).get();
  if (!dupe.empty) throw conflict(`Invoice ${input.number} already exists`);
  const ref = col.invoices.doc();
  const invoice: Omit<Invoice, "createdAt" | "updatedAt"> = {
    ...input,
    status: statusFor(input.totalMinor, input.paidMinor),
    reviewStatus: "confirmed",
    checks: [],
    source: "manual",
    reminderStage: null,
    lastRemindedAt: null,
    isSample: false,
  };
  await ref.set({ ...invoice, createdAt: now(), updatedAt: now() });
  await audit(ctx.workspaceId, ctx.uid, "invoice.created", `invoices/${ref.id}`);
  return ref.id;
}

/** Saves edited fields; for an invoice under review this also confirms it. */
export async function saveInvoiceFields(ctx: WorkspaceContext, id: string, input: z.infer<typeof invoiceInput>) {
  await assertClient(ctx, input.clientId);
  const ref = ws(ctx.workspaceId).invoices.doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Invoice not found");
  const dupe = await ws(ctx.workspaceId).invoices.where("number", "==", input.number).limit(2).get();
  if (dupe.docs.some((d) => d.id !== id)) throw conflict(`Invoice ${input.number} already exists`);
  const prev = snap.data() as Invoice;
  await ref.update({
    ...input,
    status: prev.status === "void" ? "void" : statusFor(input.totalMinor, input.paidMinor),
    reviewStatus: "confirmed",
    updatedAt: now(),
  });
  await audit(ctx.workspaceId, ctx.uid, prev.reviewStatus === "needs_review" ? "invoice.review_confirmed" : "invoice.updated", `invoices/${id}`);
}

export async function setInvoiceStatus(ctx: WorkspaceContext, id: string, action: "mark_paid" | "void" | "reopen") {
  const ref = ws(ctx.workspaceId).invoices.doc(id);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("Invoice not found");
    const inv = snap.data() as Invoice;
    if (inv.reviewStatus === "needs_review") throw conflict("Review and confirm this invoice first");
    if (action === "mark_paid") tx.update(ref, { paidMinor: inv.totalMinor, status: "paid", updatedAt: now() });
    if (action === "void") tx.update(ref, { status: "void", updatedAt: now() });
    if (action === "reopen") tx.update(ref, { status: statusFor(inv.totalMinor ?? 0, inv.paidMinor), updatedAt: now() });
    await audit(ctx.workspaceId, ctx.uid, `invoice.${action}`, `invoices/${id}`, {}, tx);
  });
}

export async function deleteInvoice(ctx: WorkspaceContext, id: string) {
  const ref = ws(ctx.workspaceId).invoices.doc(id);
  if (!(await ref.get()).exists) throw notFound("Invoice not found");
  await ref.delete();
  await audit(ctx.workspaceId, ctx.uid, "invoice.deleted", `invoices/${id}`);
}

// ---------------- Payments ----------------

/** Applies a confirmed payment to its invoice atomically. */
async function applyPayment(ctx: WorkspaceContext, paymentId: string, invoiceId: string) {
  const col = ws(ctx.workspaceId);
  await adminDb().runTransaction(async (tx) => {
    const [pSnap, iSnap] = await Promise.all([tx.get(col.payments.doc(paymentId)), tx.get(col.invoices.doc(invoiceId))]);
    if (!pSnap.exists) throw notFound("Payment not found");
    if (!iSnap.exists) throw notFound("Invoice not found");
    const p = pSnap.data() as Payment;
    const inv = iSnap.data() as Invoice;
    if (p.matchStatus === "confirmed") throw conflict("This payment is already applied");
    if (inv.currency !== p.currency) throw badRequest("Payment and invoice currencies differ");
    if (inv.totalMinor === null) throw conflict("Review the invoice before applying payments");
    const paid = inv.paidMinor + p.amountMinor;
    if (paid > inv.totalMinor) throw badRequest("Payment would exceed the invoice total");
    tx.update(col.payments.doc(paymentId), { invoiceId, matchStatus: "confirmed" });
    tx.update(col.invoices.doc(invoiceId), { paidMinor: paid, status: statusFor(inv.totalMinor, paid), updatedAt: now() });
    await audit(ctx.workspaceId, ctx.uid, "payment.applied", `payments/${paymentId}`, { invoiceId }, tx);
  });
}

export async function recordManualPayment(ctx: WorkspaceContext, input: z.infer<typeof paymentInput>) {
  const ref = ws(ctx.workspaceId).payments.doc();
  const payment: Omit<Payment, "createdAt"> = {
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    reference: input.reference,
    source: "manual",
    invoiceId: null,
    matchStatus: "unmatched",
    isSample: false,
  };
  await ref.set({ ...payment, createdAt: now() });
  if (input.invoiceId) await applyPayment(ctx, ref.id, input.invoiceId);
  return ref.id;
}

export async function decidePayment(ctx: WorkspaceContext, paymentId: string, decision: "confirm" | "reject", invoiceId?: string) {
  const ref = ws(ctx.workspaceId).payments.doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Payment not found");
  const p = snap.data() as Payment;
  if (decision === "reject") {
    await ref.update({ matchStatus: "rejected", invoiceId: null });
    await audit(ctx.workspaceId, ctx.uid, "payment.match_rejected", `payments/${paymentId}`);
    return;
  }
  const target = invoiceId ?? p.invoiceId;
  if (!target) throw badRequest("Choose an invoice for this payment");
  await applyPayment(ctx, paymentId, target);
}

export type { Client };
