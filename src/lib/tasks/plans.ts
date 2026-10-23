import type { TaskIntent } from "@/lib/domain/types";
import type { NewStep } from "./registry";

// Plans are built from fixed templates per intent. The model only classifies the request and
// extracts parameters; it cannot invent steps or reference tools outside these templates.
// `dependsOn` indexes are relative to the returned list.

export interface PlanParams {
  clientName?: string | null;
  invoiceNumber?: string | null;
  question?: string | null;
  documentIds?: string[];
  dailyCheck?: boolean;
}

export function buildPlan(intent: TaskIntent, params: PlanParams): NewStep[] {
  switch (intent) {
    case "collections":
      return [
        {
          tool: "find_overdue",
          label: params.clientName ? `Find overdue invoices for ${params.clientName}` : "Find overdue invoices",
          args: { clientName: params.clientName ?? null, invoiceNumber: params.invoiceNumber ?? null, dailyCheck: !!params.dailyCheck },
          dependsOn: [],
        },
        { tool: "prepare_recipients", label: "Match invoices to clients and email addresses", args: {}, dependsOn: [0] },
        { tool: "draft_reminders", label: "Draft reminder emails", args: {}, dependsOn: [1] },
        { tool: "verify_drafts", label: "Check every draft against its invoice", args: {}, dependsOn: [2] },
        { tool: "request_approval", label: "Ask you to approve the emails", args: {}, dependsOn: [3] },
      ];
    case "overdue_summary":
      return [
        { tool: "find_overdue", label: "Find overdue invoices", args: { clientName: params.clientName ?? null, invoiceNumber: null, dailyCheck: false }, dependsOn: [] },
        { tool: "summarize_overdue", label: "Total what is outstanding", args: {}, dependsOn: [0] },
      ];
    case "client_lookup":
      return [{ tool: "client_lookup", label: `Look up ${params.clientName ?? "the client"}`, args: { clientName: params.clientName ?? "" }, dependsOn: [] }];
    case "document_question":
      return [
        { tool: "find_invoice_document", label: `Find the document for ${params.invoiceNumber ?? "the invoice"}`, args: { invoiceNumber: params.invoiceNumber ?? "" }, dependsOn: [] },
        { tool: "answer_question", label: "Read the document and answer", args: { question: params.question ?? "" }, dependsOn: [0] },
        { tool: "verify_answer", label: "Check the answer's page references", args: {}, dependsOn: [1] },
      ];
    case "extract_documents": {
      const ids = params.documentIds ?? [];
      const steps: NewStep[] = ids.map((documentId) => ({
        tool: "extract_document",
        label: "Extract invoice fields",
        args: { documentId },
        dependsOn: [],
      }));
      // The summary waits for every extraction to finish, including ones that failed.
      steps.push({
        tool: "summarize_extraction",
        label: "Summarize extraction results",
        args: { documentIds: ids },
        dependsOn: ids.map((_, i) => i),
        dependMode: "settled",
      });
      return steps;
    }
    case "unsupported":
      return [];
  }
}

/** Steps appended after the user approves a batch of emails. */
export function sendPlan(approvalId: string): NewStep[] {
  return [
    { tool: "send_reminders", label: "Send the approved emails", args: { approvalId }, dependsOn: [] },
    { tool: "report_sends", label: "Confirm delivery with the email provider", args: { approvalId }, dependsOn: [0], dependMode: "settled" },
  ];
}

export const UNSUPPORTED_MESSAGE =
  "That isn't supported yet. OpsPilot can chase overdue invoices, summarize what's outstanding, look up a client, and answer questions about an uploaded invoice.";
