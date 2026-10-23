import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { todayInZone } from "@/lib/domain/dates";
import { normalizeName } from "@/lib/domain/matching";
import type { Invoice, Payment, Workspace } from "@/lib/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import type { WorkspaceContext } from "../session";
import { audit, ws } from "../workspace-data";

// Clearly fake records (isSample: true, example.com addresses) for trying the workflow.
// The send tool and approval service refuse to send anything marked as sample.

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const CLIENTS = [
  { key: "northwind", name: "Northwind Studio", email: "accounts@northwind.example.com", company: "Northwind Studio LLC", currency: "USD" },
  { key: "lumen", name: "Lumen Analytics", email: "finance@lumen.example.com", company: "Lumen Analytics Pvt Ltd", currency: "INR" },
  { key: "brightpath", name: "Brightpath Education", email: "billing@brightpath.example.com", company: "Brightpath Education", currency: "EUR" },
  { key: "oakline", name: "Oakline Interiors", email: "hello@oakline.example.com", company: "Oakline Interiors", currency: "USD" },
];

// [client, number, daysAgoIssued, daysUntilDue (negative = overdue), currency, totalMinor, paidMinor, lastStage]
const INVOICES: [string, string, number, number, string, number, number, Invoice["reminderStage"]][] = [
  ["northwind", "SAMPLE-1001", 60, -45, "USD", 240000, 0, "friendly"],
  ["northwind", "SAMPLE-1004", 20, -5, "USD", 85000, 0, null],
  ["lumen", "SAMPLE-1002", 40, -12, "INR", 15000000, 5000000, null],
  ["brightpath", "SAMPLE-1003", 35, -21, "EUR", 120000, 0, null],
  ["oakline", "SAMPLE-1005", 10, 20, "USD", 64000, 0, null],
  ["oakline", "SAMPLE-1006", 50, -20, "USD", 31000, 31000, null],
];

export async function loadSampleData(ctx: WorkspaceContext) {
  const db = adminDb();
  const col = ws(ctx.workspaceId);
  const existing = await col.clients.where("isSample", "==", true).limit(1).get();
  if (!existing.empty) return { created: false };

  const workspace = (await col.root.get()).data() as Workspace;
  const today = todayInZone(workspace.timezone);
  const batch = db.batch();
  const clientIds = new Map<string, string>();
  const now = FieldValue.serverTimestamp();

  for (const c of CLIENTS) {
    const ref = col.clients.doc();
    clientIds.set(c.key, ref.id);
    batch.set(ref, {
      name: c.name,
      normalizedName: normalizeName(c.name),
      emails: [c.email],
      company: c.company,
      defaultCurrency: c.currency,
      source: "sample",
      isSample: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  for (const [client, number, issuedAgo, dueIn, currency, total, paid, stage] of INVOICES) {
    const inv: Omit<Invoice, "createdAt" | "updatedAt"> = {
      number,
      clientId: clientIds.get(client)!,
      issueDate: shift(today, -issuedAgo),
      dueDate: shift(today, dueIn),
      currency,
      totalMinor: total,
      paidMinor: paid,
      status: paid >= total ? "paid" : paid > 0 ? "partially_paid" : "open",
      reviewStatus: "confirmed",
      checks: [],
      source: "sample",
      reminderStage: stage,
      lastRemindedAt: null,
      isSample: true,
    };
    batch.set(col.invoices.doc(), { ...inv, createdAt: now, updatedAt: now });
  }
  const payment: Omit<Payment, "createdAt"> = {
    amountMinor: 85000,
    currency: "USD",
    date: shift(today, -1),
    reference: "Transfer ref SAMPLE-1004",
    payerName: "Northwind Studio",
    source: "sample",
    invoiceId: null,
    matchStatus: "unmatched",
    isSample: true,
  };
  batch.set(col.payments.doc(), { ...payment, createdAt: now });
  await batch.commit();
  await audit(ctx.workspaceId, ctx.uid, "sample.loaded", `workspaces/${ctx.workspaceId}`);
  return { created: true };
}

export async function clearSampleData(ctx: WorkspaceContext) {
  const db = adminDb();
  const col = ws(ctx.workspaceId);
  const writer = db.bulkWriter();
  for (const c of [col.clients, col.invoices, col.payments]) {
    const snap = await c.where("isSample", "==", true).get();
    snap.docs.forEach((d) => writer.delete(d.ref));
  }
  await writer.close();
  await audit(ctx.workspaceId, ctx.uid, "sample.cleared", `workspaces/${ctx.workspaceId}`);
}
