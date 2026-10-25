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

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i;

export type ClientResolution =
  | { kind: "matched"; clientId: string; message: string }
  | { kind: "create"; name: string; email: string; message: string }
  | { kind: "review"; message: string };

/**
 * Decides how an extracted invoice's customer maps onto saved clients. Email is the strongest
 * identifier; a name alone is only trusted when it matches exactly one saved client. Anything
 * ambiguous or contradictory goes to review. Nothing is guessed: no email means no new client.
 */
export function resolveClient(
  hint: { name?: string | null; email?: string | null },
  clients: ClientCandidate[],
): ClientResolution {
  const name = hint.name?.trim() || null;
  const rawEmail = hint.email?.trim().toLowerCase() || null;
  const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail : null;
  const norm = name ? normalizeName(name) : "";
  const byName = norm
    ? clients.filter((c) => c.normalizedName === norm || (c.company && normalizeName(c.company) === norm))
    : [];

  if (email) {
    const byEmail = clients.filter((c) => c.emails.some((e) => e.toLowerCase() === email));
    if (byEmail.length > 1) return { kind: "review", message: `Several saved clients use ${email}` };
    if (byEmail.length === 1) {
      const other = byName.find((c) => c.id !== byEmail[0].id);
      if (other && !byName.some((c) => c.id === byEmail[0].id)) {
        return { kind: "review", message: `Invoice email belongs to one saved client but the name matches another` };
      }
      return { kind: "matched", clientId: byEmail[0].id, message: "Matched to a saved client by email" };
    }
    if (byName.length > 0) {
      return { kind: "review", message: `A saved client named “${name}” uses a different email than this invoice` };
    }
    if (!name) return { kind: "review", message: "Customer name missing on the invoice" };
    return { kind: "create", name, email, message: `New client “${name}” created from the invoice` };
  }

  const emailNote = rawEmail ? "Customer email on the invoice looks invalid" : "No customer email on the invoice";
  if (byName.length === 1) return { kind: "matched", clientId: byName[0].id, message: "Matched to a saved client by name" };
  if (byName.length > 1) return { kind: "review", message: `Several saved clients match “${name}”` };
  return { kind: "review", message: name ? `${emailNote}, and no saved client is named “${name}”` : "Customer name and email missing" };
}
