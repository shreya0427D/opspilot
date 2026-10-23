import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import Papa from "papaparse";
import { z } from "zod";
import { isIsoDate } from "@/lib/domain/dates";
import { normalizeName, suggestPaymentMatch, type OpenInvoiceCandidate } from "@/lib/domain/matching";
import { isCurrencyCode, parseAmountToMinor } from "@/lib/domain/money";
import type { Client, Invoice, Payment } from "@/lib/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import { badRequest } from "../errors";
import type { WorkspaceContext } from "../session";
import { audit, ws } from "../workspace-data";

const MAX_ROWS = 1000;

export interface ImportResult {
  imported: number;
  suggested?: number;
  errors: { row: number; message: string }[];
}

function parse(csv: string) {
  const res = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  if (res.data.length > MAX_ROWS) throw badRequest(`At most ${MAX_ROWS} rows per import`);
  return res.data;
}

const pick = (row: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (row[k]?.trim()) return row[k].trim();
  return undefined;
};

export async function importClients(ctx: WorkspaceContext, csv: string): Promise<ImportResult> {
  const rows = parse(csv);
  const col = ws(ctx.workspaceId);
  const existing = new Set((await col.clients.get()).docs.map((d) => (d.data() as Client).normalizedName));
  const errors: ImportResult["errors"] = [];
  const writer = adminDb().bulkWriter();
  let imported = 0;

  rows.forEach((row, i) => {
    const name = pick(row, "name", "client", "client_name", "customer");
    const emails = (pick(row, "email", "emails", "email_address") ?? "")
      .split(/[;,\s]+/)
      .map((e) => e.toLowerCase())
      .filter(Boolean);
    const currency = pick(row, "currency")?.toUpperCase();
    if (!name) return errors.push({ row: i + 2, message: "Missing name" });
    const badEmail = emails.find((e) => !z.email().safeParse(e).success);
    if (badEmail) return errors.push({ row: i + 2, message: `Invalid email ${badEmail}` });
    if (currency && !isCurrencyCode(currency)) return errors.push({ row: i + 2, message: `Unknown currency ${currency}` });
    const normalizedName = normalizeName(name);
    if (existing.has(normalizedName)) return errors.push({ row: i + 2, message: `${name} already exists` });
    existing.add(normalizedName);
    writer.create(col.clients.doc(), {
      name,
      normalizedName,
      emails: emails.slice(0, 5),
      company: pick(row, "company", "organization") ?? null,
      defaultCurrency: currency ?? null,
      source: "csv",
      isSample: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    imported++;
  });
  await writer.close();
  await audit(ctx.workspaceId, ctx.uid, "csv.clients_imported", "clients", { imported, errors: errors.length });
  return { imported, errors };
}

export async function importPayments(ctx: WorkspaceContext, csv: string): Promise<ImportResult> {
  const rows = parse(csv);
  const col = ws(ctx.workspaceId);
  const [invoiceSnap, clientSnap] = await Promise.all([
    col.invoices.where("status", "in", ["open", "partially_paid"]).get(),
    col.clients.get(),
  ]);
  const clientNames = new Map(clientSnap.docs.map((d) => [d.id, (d.data() as Client).normalizedName]));
  const open: OpenInvoiceCandidate[] = invoiceSnap.docs
    .map((d) => ({ id: d.id, inv: d.data() as Invoice }))
    .filter(({ inv }) => inv.reviewStatus !== "needs_review" && inv.number && inv.currency && inv.totalMinor !== null)
    .map(({ id, inv }) => ({
      id,
      number: inv.number!,
      currency: inv.currency!,
      outstandingMinor: inv.totalMinor! - inv.paidMinor,
      clientNormalizedName: inv.clientId ? clientNames.get(inv.clientId) ?? null : null,
    }));

  const importId = col.payments.doc().id;
  const errors: ImportResult["errors"] = [];
  const writer = adminDb().bulkWriter();
  let imported = 0;
  let suggested = 0;

  rows.forEach((row, i) => {
    const date = pick(row, "date", "payment_date");
    const currency = pick(row, "currency")?.toUpperCase();
    const amountRaw = pick(row, "amount", "credit", "paid");
    if (!date || !isIsoDate(date)) return errors.push({ row: i + 2, message: "Date must be YYYY-MM-DD" });
    if (!currency || !isCurrencyCode(currency)) return errors.push({ row: i + 2, message: "Missing or unknown currency" });
    const amountMinor = amountRaw ? parseAmountToMinor(amountRaw, currency) : null;
    if (!amountMinor) return errors.push({ row: i + 2, message: "Amount missing or unreadable" });
    const reference = pick(row, "reference", "description", "memo", "narration");
    const payerName = pick(row, "payer", "payer_name", "from", "name");
    const match = suggestPaymentMatch({ amountMinor, currency, reference, payerName }, open);
    if (match.kind === "suggested") suggested++;
    const payment: Omit<Payment, "createdAt"> = {
      amountMinor,
      currency,
      date,
      reference,
      payerName,
      source: "csv",
      csvImportId: importId,
      invoiceId: match.kind === "suggested" ? match.invoiceId : null,
      matchStatus: match.kind === "suggested" ? "suggested" : "unmatched",
      matchReason: match.reason,
      isSample: false,
    };
    writer.create(col.payments.doc(), { ...payment, createdAt: FieldValue.serverTimestamp() });
    imported++;
  });
  await writer.close();
  await audit(ctx.workspaceId, ctx.uid, "csv.payments_imported", "payments", { imported, suggested, errors: errors.length });
  return { imported, suggested, errors };
}
