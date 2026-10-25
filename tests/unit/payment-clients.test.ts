import { describe, expect, it } from "vitest";
import { checkExtractedInvoice, type ExtractedInvoice } from "@/lib/domain/invoice-checks";
import { normalizeName, resolveClient } from "@/lib/domain/matching";

const base: ExtractedInvoice = {
  invoiceNumber: "OPS-QA-2026-003",
  clientName: "Redstone Studio",
  clientEmail: "finance@redstone-demo.example",
  issueDate: "2026-09-01",
  dueDate: "2026-10-05",
  currency: "INR",
  subtotal: "8000.00",
  tax: "1440.00",
  total: "9440.00",
  amountPaid: null,
  lineItemAmounts: [],
  sourcePages: [1],
};
const check = (overrides: Partial<ExtractedInvoice>) => checkExtractedInvoice({ ...base, ...overrides }, true);
const paymentCheck = (r: ReturnType<typeof check>) => r.checks.find((c) => c.id === "payment_status")!;

describe("payment status from printed evidence", () => {
  it("PAID stamp with no amount-paid line counts as fully paid", () => {
    const r = check({ paymentMarking: "paid", paymentMarkingText: "PAID", paymentMarkingPage: 1 });
    expect(r.autoAccept).toBe(true);
    expect(r.normalized.paidMinor).toBe(944000);
    expect(r.normalized.paymentEvidence).toMatchObject({ marking: "paid", text: "PAID", page: 1 });
    expect(paymentCheck(r).message).toBe("Marked PAID (page 1)");
  });

  it("explicit amount paid equal to the total counts as paid", () => {
    const r = check({ amountPaid: "9,440.00" });
    expect(r.autoAccept).toBe(true);
    expect(r.normalized.paidMinor).toBe(944000);
  });

  it("unpaid invoice with no marking stays unpaid", () => {
    const r = check({});
    expect(r.autoAccept).toBe(true);
    expect(r.normalized.paidMinor).toBe(0);
  });

  it("partially paid invoice records the paid portion", () => {
    const fromPaid = check({ paymentMarking: "partially_paid", amountPaid: "4000.00" });
    expect(fromPaid.autoAccept).toBe(true);
    expect(fromPaid.normalized.paidMinor).toBe(400000);
    const fromBalance = check({ balanceDue: "5,440.00" });
    expect(fromBalance.autoAccept).toBe(true);
    expect(fromBalance.normalized.paidMinor).toBe(400000);
  });

  it("PAID stamp contradicted by a balance due goes to review, not reminders", () => {
    const r = check({ paymentMarking: "paid", balanceDue: "9440.00" });
    expect(r.autoAccept).toBe(false);
    expect(r.normalized.paidMinor).toBe(0);
    expect(paymentCheck(r).message).toMatch(/still shows an amount due/);
  });

  it("PAID stamp contradicted by a partial amount paid goes to review", () => {
    expect(check({ paymentMarking: "paid", amountPaid: "1000.00" }).autoAccept).toBe(false);
  });

  it("amount paid and balance that don't add up go to review", () => {
    expect(check({ amountPaid: "1000.00", balanceDue: "1000.00" }).autoAccept).toBe(false);
  });

  it("undeterminable status (unreadable total or amounts) goes to review", () => {
    expect(check({ paymentMarking: "paid", total: null, subtotal: null, tax: null }).autoAccept).toBe(false);
    expect(check({ amountPaid: "about half" }).autoAccept).toBe(false);
    expect(check({ paymentMarking: "partially_paid" }).autoAccept).toBe(false);
  });

  it("UNPAID marking contradicted by full payment goes to review", () => {
    expect(check({ paymentMarking: "unpaid", amountPaid: "9440.00" }).autoAccept).toBe(false);
  });
});

const saved = [
  { id: "acme", normalizedName: normalizeName("Acme Corp"), emails: ["ap@acme.example"] },
  { id: "globex", normalizedName: normalizeName("Globex"), emails: ["billing@globex.example"] },
];

describe("client resolution for uploaded invoices", () => {
  it("new customer with a valid email is created", () => {
    expect(resolveClient({ name: "Northstar Design Studio", email: "Billing@Northstar-demo.example" }, saved)).toEqual({
      kind: "create",
      name: "Northstar Design Studio",
      email: "billing@northstar-demo.example",
      message: "New client “Northstar Design Studio” created from the invoice",
    });
  });

  it("existing customer matched by email is linked", () => {
    expect(resolveClient({ name: "ACME Corporation Pvt Ltd", email: "ap@acme.example" }, saved)).toMatchObject({ kind: "matched", clientId: "acme" });
  });

  it("similar name with a different email goes to review (no duplicate client)", () => {
    expect(resolveClient({ name: "Acme Corp", email: "other@acme-lookalike.example" }, saved)).toMatchObject({ kind: "review" });
  });

  it("missing email never creates a client", () => {
    expect(resolveClient({ name: "Brand New Co", email: null }, saved)).toMatchObject({ kind: "review" });
    expect(resolveClient({ name: "Acme Corp", email: null }, saved)).toMatchObject({ kind: "matched", clientId: "acme" });
  });

  it("invalid email is not used", () => {
    expect(resolveClient({ name: "Brand New Co", email: "not-an-email" }, saved)).toMatchObject({ kind: "review", message: expect.stringMatching(/invalid/) });
  });

  it("email of one client with the name of another is a conflict", () => {
    expect(resolveClient({ name: "Globex", email: "ap@acme.example" }, saved)).toMatchObject({ kind: "review" });
  });

  it("missing name with an unknown email is not invented", () => {
    expect(resolveClient({ name: null, email: "new@x.example" }, saved)).toMatchObject({ kind: "review" });
  });
});
