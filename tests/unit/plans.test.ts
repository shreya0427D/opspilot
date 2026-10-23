import { describe, expect, it } from "vitest";
import { buildPlan, sendPlan } from "@/lib/tasks/plans";

const KNOWN_TOOLS = new Set([
  "find_overdue",
  "prepare_recipients",
  "draft_reminders",
  "verify_drafts",
  "request_approval",
  "summarize_overdue",
  "client_lookup",
  "find_invoice_document",
  "answer_question",
  "verify_answer",
  "extract_document",
  "summarize_extraction",
  "send_reminders",
  "report_sends",
]);

const INTENTS = ["collections", "overdue_summary", "client_lookup", "document_question", "extract_documents"] as const;

describe("plan templates", () => {
  for (const intent of INTENTS) {
    it(`${intent}: only uses registered tools and acyclic, backward dependencies`, () => {
      const steps = buildPlan(intent, { documentIds: ["a", "b"], clientName: "Acme", invoiceNumber: "INV-1", question: "Terms?" });
      expect(steps.length).toBeGreaterThan(0);
      steps.forEach((s, i) => {
        expect(KNOWN_TOOLS.has(s.tool)).toBe(true);
        s.dependsOn.forEach((d) => expect(d).toBeLessThan(i));
      });
    });
  }

  it("never puts an external action in a planner-built plan", () => {
    for (const intent of INTENTS) {
      expect(buildPlan(intent, { documentIds: ["a"] }).some((s) => s.tool === "send_reminders")).toBe(false);
    }
  });

  it("collections always ends at the approval gate", () => {
    const steps = buildPlan("collections", {});
    expect(steps.at(-1)?.tool).toBe("request_approval");
  });

  it("unsupported requests produce no steps", () => {
    expect(buildPlan("unsupported", {})).toEqual([]);
  });

  it("the send plan reports even when sending fails", () => {
    const [send, report] = sendPlan("a1");
    expect(send.tool).toBe("send_reminders");
    expect(report.dependMode).toBe("settled");
  });
});
