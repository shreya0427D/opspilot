import "server-only";
import { z } from "zod";
import { answerDocumentQuestion } from "@/lib/ai/prompts";
import { matchClient } from "@/lib/domain/matching";
import { formatMinor, totalsByCurrency } from "@/lib/domain/money";
import type { DocumentRecord, Invoice } from "@/lib/domain/types";
import { adminBucket } from "@/lib/firebase/admin";
import { AppError } from "@/lib/server/errors";
import { ws } from "@/lib/server/workspace-data";
import { registerTool } from "../registry";
import { loadClients, outstanding, type OverdueItem } from "./shared";

const fmtTotals = (totals: Record<string, number>) =>
  Object.entries(totals).map(([c, m]) => formatMinor(m, c)).join(" + ") || "nothing";

registerTool({
  name: "summarize_overdue",
  lane: "data",
  permission: "read",
  maxAttempts: 2,
  argsSchema: z.object({}),
  async run(ctx) {
    const found = ctx.deps[ctx.step.dependsOn[0]] as { items: OverdueItem[]; totals: Record<string, number>; needsReview: number };
    const clients = new Map((await loadClients(ctx.workspaceId)).map((c) => [c.id, c.name]));
    const byClient = new Map<string, OverdueItem[]>();
    for (const item of found.items) {
      const name = (item.clientId && clients.get(item.clientId)) || "Unlinked invoices";
      byClient.set(name, [...(byClient.get(name) ?? []), item]);
    }
    const lines = [...byClient.entries()].map(([name, items]) => {
      const t = totalsByCurrency(items, (i) => ({ currency: i.currency, minor: i.outstandingMinor }));
      const oldest = Math.max(...items.map((i) => i.daysOverdue));
      return `${name}: ${fmtTotals(t)} across ${items.length} invoice(s), oldest ${oldest} days overdue`;
    });
    return {
      output: { byClient: lines },
      verification: "pass",
      summary: `Overdue: ${fmtTotals(found.totals)} across ${found.items.length} invoice(s).`,
      report: {
        verified: lines.length ? lines : ["Nothing is overdue."],
        failed: [],
        skipped: [],
        needsReview: found.needsReview ? [`${found.needsReview} extracted invoice(s) await your review and were not counted`] : [],
      },
    };
  },
});

registerTool({
  name: "client_lookup",
  lane: "data",
  permission: "read",
  maxAttempts: 2,
  argsSchema: z.object({ clientName: z.string().min(1) }),
  async run(ctx, { clientName }) {
    const clients = await loadClients(ctx.workspaceId);
    const match = matchClient({ name: clientName }, clients);
    if (match.kind !== "matched") {
      throw new AppError(404, "client_not_found", match.kind === "ambiguous" ? `Several clients match "${clientName}"` : `No saved client matches "${clientName}"`);
    }
    const client = clients.find((c) => c.id === match.clientId)!;
    const invSnap = await ws(ctx.workspaceId).invoices.where("clientId", "==", client.id).get();
    const invoices = invSnap.docs.map((d) => d.data() as Invoice).filter((i) => i.currency && i.totalMinor !== null);
    const open = invoices.filter((i) => i.status === "open" || i.status === "partially_paid");
    const outstandingTotals = totalsByCurrency(open, (i) => ({ currency: i.currency!, minor: outstanding(i) }));
    const lines = [
      `${client.name}${client.company ? ` (${client.company})` : ""}, ${client.emails.join(", ")}`,
      `${invoices.length} invoice(s), ${open.length} open`,
      `Outstanding: ${fmtTotals(outstandingTotals)}`,
    ];
    return {
      output: { clientId: client.id, lines },
      verification: "pass",
      summary: lines.join(". "),
      report: { verified: lines, failed: [], skipped: [], needsReview: [] },
    };
  },
});

registerTool({
  name: "find_invoice_document",
  lane: "document",
  permission: "read",
  maxAttempts: 2,
  argsSchema: z.object({ invoiceNumber: z.string() }),
  async run(ctx, { invoiceNumber }) {
    if (!invoiceNumber) throw new AppError(400, "missing_invoice", "Mention which invoice number the question is about");
    const snap = await ws(ctx.workspaceId).invoices.where("number", "==", invoiceNumber).limit(2).get();
    if (snap.empty) throw new AppError(404, "invoice_not_found", `No invoice numbered ${invoiceNumber}`);
    const inv = snap.docs[0].data() as Invoice;
    if (!inv.sourceDocumentId) throw new AppError(404, "no_document", `Invoice ${invoiceNumber} was entered by hand and has no document`);
    const doc = (await ws(ctx.workspaceId).documents.doc(inv.sourceDocumentId).get()).data() as DocumentRecord | undefined;
    if (!doc) throw new AppError(404, "no_document", "The source document was deleted");
    return { output: { documentId: inv.sourceDocumentId, storagePath: doc.storagePath, mime: doc.mime, pageCount: doc.pageCount, fileName: doc.fileName } };
  },
});

registerTool({
  name: "answer_question",
  lane: "document",
  permission: "read",
  maxAttempts: 3,
  argsSchema: z.object({ question: z.string() }),
  async run(ctx, { question }) {
    if (!question) throw new AppError(400, "missing_question", "No question was found in the request");
    const found = ctx.deps[ctx.step.dependsOn[0]] as { storagePath: string; mime: string };
    if (!found.storagePath.startsWith(`workspaces/${ctx.workspaceId}/`)) throw new AppError(403, "forbidden", "Document is outside this workspace");
    const [bytes] = await adminBucket().file(found.storagePath).download();
    const { data, costMicros } = await answerDocumentQuestion(ctx.workspaceId, { base64: bytes.toString("base64"), mime: found.mime }, question);
    return { output: { ...data, fileName: (found as { fileName?: string }).fileName, pageCount: (found as { pageCount?: number }).pageCount ?? null }, costMicros };
  },
});

registerTool({
  name: "verify_answer",
  lane: "verification",
  permission: "read",
  maxAttempts: 2,
  argsSchema: z.object({}),
  async run(ctx) {
    const a = ctx.deps[ctx.step.dependsOn[0]] as { answerable: boolean; answer: string; citedPages: number[]; pageCount: number | null; fileName?: string };
    const pagesValid = a.citedPages.length > 0 && a.citedPages.every((p) => a.pageCount === null || p <= a.pageCount);
    const source = `${a.fileName ?? "document"}${a.citedPages.length ? `, page ${a.citedPages.join(", ")}` : ""}`;
    if (!a.answerable) {
      return { output: {}, verification: "pass", summary: "The document doesn't contain an answer to that question.", report: { verified: [], failed: [], skipped: [], needsReview: ["The document doesn't answer this question"] } };
    }
    return {
      output: { pagesValid },
      verification: pagesValid ? "pass" : "needs_review",
      summary: `${a.answer} (${source})`,
      report: pagesValid
        ? { verified: [`${a.answer} — source: ${source}`], failed: [], skipped: [], needsReview: [] }
        : { verified: [], failed: [], skipped: [], needsReview: [`${a.answer} — the cited pages could not be confirmed; check the document`] },
    };
  },
});
