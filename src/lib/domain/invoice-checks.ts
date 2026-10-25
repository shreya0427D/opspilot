import { isIsoDate } from "./dates";
import { isCurrencyCode, parseAmountToMinor } from "./money";
import type { InvoiceCheck } from "./types";

// Raw fields as returned by the extraction model (strings, possibly null). Code decides whether
// the result is trustworthy enough to auto-accept.
export interface ExtractedInvoice {
  invoiceNumber: string | null;
  clientName: string | null;
  clientEmail: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: string | null;
  tax: string | null;
  total: string | null;
  amountPaid: string | null;
  /** Remaining amount printed on the invoice ("Balance due", "Amount due"), if any. */
  balanceDue?: string | null;
  /** A visible payment marking such as a PAID stamp. The model reports it; code decides. */
  paymentMarking?: PaymentMarking;
  paymentMarkingText?: string | null;
  paymentMarkingPage?: number | null;
  lineItemAmounts: string[];
  sourcePages: number[];
}

export const PAYMENT_MARKINGS = ["paid", "partially_paid", "unpaid", "none"] as const;
export type PaymentMarking = (typeof PAYMENT_MARKINGS)[number];

/** Evidence kept on the invoice so a reviewer can see why a payment status was chosen. */
export interface PaymentEvidence {
  marking: PaymentMarking;
  text: string | null;
  page: number | null;
  balanceDueMinor: number | null;
}

export interface NormalizedInvoice {
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  totalMinor: number | null;
  paidMinor: number;
  paymentEvidence: PaymentEvidence;
}

export function checkExtractedInvoice(
  raw: ExtractedInvoice,
  client: boolean | { ok: boolean; message: string },
): { checks: InvoiceCheck[]; normalized: NormalizedInvoice; autoAccept: boolean } {
  const checks: InvoiceCheck[] = [];
  const add = (id: string, ok: boolean, message: string) => checks.push({ id, ok, message });

  const currency = raw.currency?.trim().toUpperCase() ?? null;
  const currencyOk = !!currency && isCurrencyCode(currency);
  add("currency", currencyOk, currencyOk ? `Currency ${currency}` : "Currency missing or unknown");

  const number = raw.invoiceNumber?.trim() || null;
  add("number", !!number, number ? "Invoice number found" : "Invoice number missing");

  const issueOk = !!raw.issueDate && isIsoDate(raw.issueDate);
  const dueOk = !!raw.dueDate && isIsoDate(raw.dueDate);
  add("issue_date", issueOk, issueOk ? "Issue date valid" : "Issue date missing or invalid");
  add("due_date", dueOk, dueOk ? "Due date valid" : "Due date missing or invalid");
  if (issueOk && dueOk) {
    const ordered = raw.dueDate! >= raw.issueDate!;
    add("date_order", ordered, ordered ? "Due date on/after issue date" : "Due date is before issue date");
  }

  const toMinor = (v: string | null) => (v && currencyOk ? parseAmountToMinor(v, currency!) : null);
  const total = toMinor(raw.total);
  add("total", total !== null && total > 0, total !== null ? "Total parsed" : "Total missing or unreadable");

  const subtotal = toMinor(raw.subtotal);
  const tax = raw.tax ? toMinor(raw.tax) : 0;
  if (subtotal !== null && tax !== null && total !== null) {
    const ok = subtotal + tax === total;
    add("subtotal_tax_total", ok, ok ? "Subtotal + tax = total" : "Subtotal + tax does not equal total");
  }

  if (raw.lineItemAmounts.length > 0 && currencyOk) {
    const items = raw.lineItemAmounts.map((a) => parseAmountToMinor(a, currency!));
    if (items.every((i): i is number => i !== null)) {
      const sum = items.reduce((a, b) => a + b, 0);
      const target = subtotal ?? total;
      if (target !== null) {
        const ok = sum === target;
        add("line_items", ok, ok ? "Line items add up" : "Line items do not add up");
      }
    } else {
      add("line_items", false, "Some line item amounts are unreadable");
    }
  }

  const payment = resolvePayment(raw, total, toMinor);
  add("payment_status", payment.ok, payment.message);

  const c = typeof client === "boolean" ? { ok: client, message: client ? "Matched to a saved client" : "Not matched to a saved client" } : client;
  add("client", c.ok, c.message);

  return {
    checks,
    normalized: {
      number,
      issueDate: issueOk ? raw.issueDate : null,
      dueDate: dueOk ? raw.dueDate : null,
      currency: currencyOk ? currency : null,
      totalMinor: total,
      paidMinor: payment.paidMinor,
      paymentEvidence: payment.evidence,
    },
    autoAccept: checks.every((c) => c.ok),
  };
}

/**
 * Decides how much of the invoice is paid from the printed evidence. A PAID stamp counts only
 * when nothing on the invoice contradicts it; any contradiction (a balance still due, an amount
 * paid below the total) fails the check so the invoice goes to review instead of reminders.
 */
export function resolvePayment(
  raw: ExtractedInvoice,
  total: number | null,
  toMinor: (v: string | null) => number | null,
): { ok: boolean; message: string; paidMinor: number; evidence: PaymentEvidence } {
  const marking: PaymentMarking = raw.paymentMarking ?? "none";
  const paidPrinted = raw.amountPaid ? toMinor(raw.amountPaid) : null;
  const balance = raw.balanceDue ? toMinor(raw.balanceDue) : null;
  const evidence: PaymentEvidence = {
    marking,
    text: raw.paymentMarkingText?.slice(0, 120) ?? null,
    page: raw.paymentMarkingPage ?? null,
    balanceDueMinor: balance,
  };
  const where = evidence.page ? ` (page ${evidence.page})` : "";
  const fail = (message: string) => ({ ok: false, message, paidMinor: 0, evidence });
  const pass = (message: string, paidMinor: number) => ({ ok: true, message, paidMinor, evidence });

  if ((raw.amountPaid && paidPrinted === null) || (raw.balanceDue && balance === null)) {
    return fail("Payment amounts on the invoice are unreadable");
  }
  if (total === null) return fail("Payment status can't be checked without a readable total");
  if (paidPrinted !== null && paidPrinted > total) return fail("Amount paid exceeds the total");
  if (balance !== null && balance > total) return fail("Balance due exceeds the total");
  if (paidPrinted !== null && balance !== null && paidPrinted + balance !== total) {
    return fail("Amount paid and balance due don't add up to the total");
  }

  // What the printed numbers say, independent of any stamp.
  const paidFromNumbers = paidPrinted ?? (balance !== null ? total - balance : null);

  switch (marking) {
    case "paid":
      if (paidFromNumbers !== null && paidFromNumbers < total) {
        return fail(`Marked PAID${where} but the invoice still shows an amount due`);
      }
      return pass(`Marked PAID${where}`, total);
    case "partially_paid":
      if (paidFromNumbers === null) return fail(`Marked partially paid${where} but the paid amount isn't shown`);
      if (paidFromNumbers <= 0 || paidFromNumbers >= total) {
        return fail(`Marked partially paid${where} but the amounts say otherwise`);
      }
      return pass(`Partially paid${where}`, paidFromNumbers);
    case "unpaid":
      if (paidFromNumbers !== null && paidFromNumbers >= total) {
        return fail(`Marked unpaid${where} but the amounts show it fully paid`);
      }
      return pass(`Marked unpaid${where}`, paidFromNumbers ?? 0);
    case "none":
      return pass(paidFromNumbers ? "Payment amounts consistent" : "No payment shown", paidFromNumbers ?? 0);
  }
}
