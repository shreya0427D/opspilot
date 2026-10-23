import { formatMinor } from "./money";
import { daysOverdue } from "./dates";
import type { ReminderStage } from "./types";

// Facts in a reminder (amounts, dates, invoice numbers) are inserted by code. The model only
// writes `personal_note`, which is rejected if it contains digits or currency symbols.

export const PLACEHOLDERS = [
  "client_name",
  "invoice_number",
  "amount_due",
  "due_date",
  "days_overdue",
  "sender_name",
  "personal_note",
] as const;

export const DEFAULT_TEMPLATES: Record<
  ReminderStage,
  { subject: string; body: string; toneNotes: string }
> = {
  friendly: {
    subject: "Friendly reminder: invoice {{invoice_number}}",
    body:
      "Hi {{client_name}},\n\n{{personal_note}}\n\nThis is a quick reminder that invoice {{invoice_number}} for {{amount_due}} was due on {{due_date}}. If it's already on its way, please ignore this note.\n\nThanks,\n{{sender_name}}",
    toneNotes: "Warm and brief. Assume good faith.",
  },
  firm: {
    subject: "Payment overdue: invoice {{invoice_number}}",
    body:
      "Hi {{client_name}},\n\n{{personal_note}}\n\nInvoice {{invoice_number}} for {{amount_due}} is now {{days_overdue}} days past its due date of {{due_date}}. Could you let me know when I can expect payment?\n\nBest regards,\n{{sender_name}}",
    toneNotes: "Polite but direct. Ask for a payment date.",
  },
  final: {
    subject: "Final reminder: invoice {{invoice_number}} is {{days_overdue}} days overdue",
    body:
      "Hi {{client_name}},\n\n{{personal_note}}\n\nDespite earlier reminders, invoice {{invoice_number}} for {{amount_due}} (due {{due_date}}) remains unpaid. Please arrange payment or reply to discuss.\n\nRegards,\n{{sender_name}}",
    toneNotes: "Professional and serious. No threats.",
  },
};

/** Which stage the next reminder should use, given the last one sent and how late it is. */
export function nextStage(last: ReminderStage | null, overdueDays: number): ReminderStage {
  if (last === "final" || last === "firm") return "final";
  if (last === "friendly") return "firm";
  if (overdueDays >= 30) return "firm";
  return "friendly";
}

export interface ReminderFacts {
  clientName: string;
  invoiceNumber: string;
  currency: string;
  amountDueMinor: number;
  dueDate: string;
  today: string;
  senderName: string;
}

export function factValues(f: ReminderFacts): Record<string, string> {
  return {
    client_name: f.clientName,
    invoice_number: f.invoiceNumber,
    amount_due: formatMinor(f.amountDueMinor, f.currency),
    due_date: f.dueDate,
    days_overdue: String(Math.max(0, daysOverdue(f.dueDate, f.today))),
    sender_name: f.senderName,
  };
}

export function isSafePersonalNote(note: string): boolean {
  return note.length <= 400 && !/[\d$€£₹¥{}]/.test(note);
}

export function renderTemplate(
  template: string,
  values: Record<string, string>,
  personalNote: string,
): string {
  const note = isSafePersonalNote(personalNote) ? personalNote.trim() : "";
  const all: Record<string, string> = { ...values, personal_note: note };
  return template
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => (key in all ? all[key] : match))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Checks a (possibly user-edited) draft against the invoice record before it can be sent. */
export function verifyDraft(
  draft: { to: string; subject: string; body: string },
  facts: ReminderFacts,
  allowedEmails: string[],
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const values = factValues(facts);
  if (!allowedEmails.map((e) => e.toLowerCase()).includes(draft.to.toLowerCase())) {
    problems.push("Recipient is not one of the client's saved email addresses");
  }
  const text = `${draft.subject}\n${draft.body}`;
  if (/\{\{[^}]*\}\}/.test(text)) problems.push("Unfilled placeholder in the email");
  if (!text.includes(values.invoice_number)) problems.push("Invoice number missing from the email");
  if (!draft.body.includes(values.amount_due)) problems.push(`Amount ${values.amount_due} missing from the email`);
  if (draft.body.length > 5000) problems.push("Email body is too long");
  return { ok: problems.length === 0, problems };
}
