import { describe, expect, it } from "vitest";
import { checkExtractedInvoice, type ExtractedInvoice } from "@/lib/domain/invoice-checks";
import { matchClient, normalizeName, suggestPaymentMatch } from "@/lib/domain/matching";
import {
  DEFAULT_TEMPLATES,
  factValues,
  isSafePersonalNote,
  nextStage,
  renderTemplate,
  verifyDraft,
  type ReminderFacts,
} from "@/lib/domain/reminders";

const clients = [
  { id: "c1", normalizedName: normalizeName("Acme Pvt Ltd"), emails: ["ap@acme.com"] },
  { id: "c2", normalizedName: normalizeName("Globex LLC"), emails: ["billing@globex.io"] },
];

describe("client matching", () => {
  it("normalizes company suffixes and punctuation", () => {
    expect(normalizeName("ACME Pvt. Ltd.")).toBe("acme");
    expect(normalizeName("Globex, LLC")).toBe("globex");
  });

  it("matches by email first, then by name", () => {
    expect(matchClient({ email: "AP@acme.com" }, clients)).toEqual({
      kind: "matched",
      clientId: "c1",
      reason: "email",
    });
    expect(matchClient({ name: "Globex Inc." }, clients)).toMatchObject({ clientId: "c2" });
    expect(matchClient({ name: "Initech" }, clients)).toEqual({ kind: "none" });
  });
});

describe("payment matching", () => {
  const open = [
    { id: "i1", number: "INV-1001", currency: "USD", outstandingMinor: 50000, clientNormalizedName: "acme" },
    { id: "i2", number: "INV-1002", currency: "USD", outstandingMinor: 50000, clientNormalizedName: "globex" },
    { id: "i3", number: "INV-1003", currency: "INR", outstandingMinor: 90000, clientNormalizedName: "acme" },
  ];

  it("suggests a match from the reference", () => {
    const m = suggestPaymentMatch({ amountMinor: 50000, currency: "USD", reference: "Payment for INV-1002" }, open);
    expect(m).toMatchObject({ kind: "suggested", invoiceId: "i2" });
  });

  it("refuses ambiguous amount-only matches", () => {
    const m = suggestPaymentMatch({ amountMinor: 50000, currency: "USD" }, open);
    expect(m.kind).toBe("none");
  });

  it("uses payer name to break an amount tie", () => {
    const m = suggestPaymentMatch({ amountMinor: 50000, currency: "USD", payerName: "Acme Ltd" }, open);
    expect(m).toMatchObject({ kind: "suggested", invoiceId: "i1" });
  });

  it("never matches across currencies", () => {
    const m = suggestPaymentMatch({ amountMinor: 90000, currency: "EUR", reference: "INV-1003" }, open);
    expect(m.kind).toBe("none");
  });
});

describe("reminders", () => {
  const facts: ReminderFacts = {
    clientName: "Acme",
    invoiceNumber: "INV-1001",
    currency: "USD",
    amountDueMinor: 123450,
    dueDate: "2026-10-01",
    today: "2026-10-23",
    senderName: "Sam",
  };

  it("escalates stages", () => {
    expect(nextStage(null, 5)).toBe("friendly");
    expect(nextStage(null, 40)).toBe("firm");
    expect(nextStage("friendly", 5)).toBe("firm");
    expect(nextStage("firm", 5)).toBe("final");
  });

  it("rejects personal notes containing numbers or currency", () => {
    expect(isSafePersonalNote("Hope the launch went well!")).toBe(true);
    expect(isSafePersonalNote("You owe $500")).toBe(false);
    expect(isSafePersonalNote("Pay within 3 days")).toBe(false);
  });

  it("renders code-inserted facts and drops unsafe notes", () => {
    const body = renderTemplate(DEFAULT_TEMPLATES.firm.body, factValues(facts), "Pay 999 now");
    expect(body).toContain("$1,234.50");
    expect(body).toContain("22 days");
    expect(body).not.toContain("999");
  });

  it("verifies drafts against the record", () => {
    const values = factValues(facts);
    const subject = renderTemplate(DEFAULT_TEMPLATES.friendly.subject, values, "");
    const body = renderTemplate(DEFAULT_TEMPLATES.friendly.body, values, "Hope all is well.");
    expect(verifyDraft({ to: "ap@acme.com", subject, body }, facts, ["ap@acme.com"]).ok).toBe(true);

    const tampered = verifyDraft(
      { to: "attacker@evil.com", subject, body: body.replace("$1,234.50", "$12.00") },
      facts,
      ["ap@acme.com"],
    );
    expect(tampered.ok).toBe(false);
    expect(tampered.problems).toHaveLength(2);
  });
});

describe("extracted invoice checks", () => {
  const base: ExtractedInvoice = {
    invoiceNumber: "INV-7",
    clientName: "Acme",
    clientEmail: null,
    issueDate: "2026-09-01",
    dueDate: "2026-09-30",
    currency: "usd",
    subtotal: "1,000.00",
    tax: "180.00",
    total: "1,180.00",
    amountPaid: null,
    lineItemAmounts: ["600.00", "400.00"],
    sourcePages: [1],
  };

  it("auto-accepts a consistent, matched invoice", () => {
    const r = checkExtractedInvoice(base, true);
    expect(r.autoAccept).toBe(true);
    expect(r.normalized).toMatchObject({ currency: "USD", totalMinor: 118000, paidMinor: 0 });
  });

  it("sends inconsistent totals to review", () => {
    const r = checkExtractedInvoice({ ...base, total: "1,200.00" }, true);
    expect(r.autoAccept).toBe(false);
    expect(r.checks.find((c) => c.id === "subtotal_tax_total")?.ok).toBe(false);
  });

  it("sends unmatched clients to review", () => {
    expect(checkExtractedInvoice(base, false).autoAccept).toBe(false);
  });
});
