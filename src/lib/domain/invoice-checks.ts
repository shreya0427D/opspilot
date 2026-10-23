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
  lineItemAmounts: string[];
  sourcePages: number[];
}

export interface NormalizedInvoice {
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  totalMinor: number | null;
  paidMinor: number;
}

export function checkExtractedInvoice(
  raw: ExtractedInvoice,
  clientMatched: boolean,
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

  const paid = raw.amountPaid ? toMinor(raw.amountPaid) : 0;
  const paidOk = paid !== null && (total === null || paid <= total);
  add("paid", paidOk, paidOk ? "Paid amount consistent" : "Paid amount unreadable or exceeds total");

  add("client", clientMatched, clientMatched ? "Matched to a saved client" : "Not matched to a saved client");

  return {
    checks,
    normalized: {
      number,
      issueDate: issueOk ? raw.issueDate : null,
      dueDate: dueOk ? raw.dueDate : null,
      currency: currencyOk ? currency : null,
      totalMinor: total,
      paidMinor: paidOk ? (paid ?? 0) : 0,
    },
    autoAccept: checks.every((c) => c.ok),
  };
}
