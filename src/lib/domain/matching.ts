// Deterministic matching. The model never decides which client an invoice belongs to or which
// invoice a payment settles; these functions do, and they only "suggest" when unambiguous.

const COMPANY_SUFFIXES =
  /\b(private limited|pvt ltd|pvt|ltd|limited|llc|l\.l\.c|inc|incorporated|co|corp|corporation|gmbh|plc|llp)\b\.?/g;

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export interface ClientCandidate {
  id: string;
  normalizedName: string;
  emails: string[];
  company?: string;
}

export type ClientMatch =
  | { kind: "matched"; clientId: string; reason: string }
  | { kind: "ambiguous"; clientIds: string[] }
  | { kind: "none" };

export function matchClient(
  hint: { name?: string | null; email?: string | null },
  clients: ClientCandidate[],
): ClientMatch {
  const email = hint.email?.trim().toLowerCase();
  if (email) {
    const byEmail = clients.filter((c) => c.emails.some((e) => e.toLowerCase() === email));
    if (byEmail.length === 1) return { kind: "matched", clientId: byEmail[0].id, reason: "email" };
    if (byEmail.length > 1) return { kind: "ambiguous", clientIds: byEmail.map((c) => c.id) };
  }
  const name = hint.name ? normalizeName(hint.name) : "";
  if (!name) return { kind: "none" };
  const byName = clients.filter(
    (c) => c.normalizedName === name || (c.company && normalizeName(c.company) === name),
  );
  if (byName.length === 1) return { kind: "matched", clientId: byName[0].id, reason: "name" };
  if (byName.length > 1) return { kind: "ambiguous", clientIds: byName.map((c) => c.id) };
  return { kind: "none" };
}

export interface OpenInvoiceCandidate {
  id: string;
  number: string;
  currency: string;
  outstandingMinor: number;
  clientNormalizedName: string | null;
}

export interface PaymentHint {
  amountMinor: number;
  currency: string;
  reference?: string;
  payerName?: string;
}

export type PaymentMatch =
  | { kind: "suggested"; invoiceId: string; reason: string }
  | { kind: "none"; reason: string };

function referenceMentions(reference: string, invoiceNumber: string): boolean {
  const ref = reference.toLowerCase().replace(/[^a-z0-9]/g, " ");
  const num = invoiceNumber.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (num.length < 3) return false;
  return ref.split(/\s+/).some((token) => token === num) || ref.replace(/\s+/g, "").includes(num);
}

export function suggestPaymentMatch(
  payment: PaymentHint,
  invoices: OpenInvoiceCandidate[],
): PaymentMatch {
  const sameCurrency = invoices.filter((i) => i.currency === payment.currency);
  if (sameCurrency.length === 0) return { kind: "none", reason: "No open invoice in this currency" };

  const scored = sameCurrency.map((inv) => {
    const reasons: string[] = [];
    let score = 0;
    if (payment.reference && referenceMentions(payment.reference, inv.number)) {
      score += 3;
      reasons.push("reference mentions invoice number");
    }
    if (inv.outstandingMinor === payment.amountMinor) {
      score += 2;
      reasons.push("amount equals outstanding balance");
    }
    if (
      payment.payerName &&
      inv.clientNormalizedName &&
      normalizeName(payment.payerName) === inv.clientNormalizedName
    ) {
      score += 1;
      reasons.push("payer name matches client");
    }
    return { inv, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  // Require at least an exact amount match or a reference hit, and a unique best.
  if (best.score < 2) return { kind: "none", reason: "No confident match" };
  if (second && second.score === best.score) return { kind: "none", reason: "Several invoices match equally" };
  if (payment.amountMinor > best.inv.outstandingMinor) {
    return { kind: "none", reason: "Payment exceeds the outstanding balance" };
  }
  return { kind: "suggested", invoiceId: best.inv.id, reason: best.reasons.join("; ") };
}
