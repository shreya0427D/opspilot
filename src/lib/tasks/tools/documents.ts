import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { extractInvoice } from "@/lib/ai/prompts";
import { checkExtractedInvoice } from "@/lib/domain/invoice-checks";
import { normalizeName, resolveClient } from "@/lib/domain/matching";
import type { DocumentRecord, Invoice } from "@/lib/domain/types";
import { adminBucket, adminDb } from "@/lib/firebase/admin";
import { AppError } from "@/lib/server/errors";
import { audit, ws } from "@/lib/server/workspace-data";
import { registerTool } from "../registry";
import { loadClients } from "./shared";

registerTool({
  name: "extract_document",
  lane: "document",
  permission: "write_internal",
  maxAttempts: 3,
  argsSchema: z.object({ documentId: z.string() }),
  async run(ctx, { documentId }) {
    const col = ws(ctx.workspaceId);
    const docRef = col.documents.doc(documentId);
    const record = (await docRef.get()).data() as DocumentRecord | undefined;
    if (!record) throw new AppError(404, "not_found", "Document not found");
    if (!record.storagePath.startsWith(`workspaces/${ctx.workspaceId}/`)) throw new AppError(403, "forbidden", "Document is outside this workspace");
    if (record.status === "processed") return { output: { documentId, invoiceIds: record.invoiceIds, alreadyDone: true } };

    await docRef.update({ status: "processing" });
    const [bytes] = await adminBucket().file(record.storagePath).download();
    let extraction;
    try {
      extraction = await extractInvoice(ctx.workspaceId, { base64: bytes.toString("base64"), mime: record.mime });
    } catch (err) {
      await docRef.update({
        status: "failed",
        error: err instanceof AppError ? err.message : "Extraction failed; you can retry or enter the invoice by hand",
      });
      throw err;
    }
    const { data, costMicros } = extraction;

    if (!data.isInvoice || !data.invoice) {
      await docRef.update({ status: "rejected", error: "This file doesn't look like an invoice" });
      return { output: { documentId, outcome: "rejected" }, costMicros, verification: "needs_review" };
    }

    const raw = data.invoice;
    const clients = await loadClients(ctx.workspaceId);
    const resolution = resolveClient({ name: raw.clientName, email: raw.clientEmail }, clients);
    // Provisionally treat a creatable new customer as resolved; it is only created below if
    // every other check passes, otherwise it is offered to the reviewer instead.
    const { checks, normalized } = checkExtractedInvoice(raw, {
      ok: resolution.kind !== "review",
      message: resolution.message,
    });

    if (data.multipleInvoices) checks.push({ id: "multiple", ok: false, message: "File contains several invoices; only the first was read" });
    if (normalized.number) {
      const dupes = await col.invoices.where("number", "==", normalized.number).limit(2).get();
      if (dupes.docs.some((d) => d.id !== `inv_${documentId}`)) {
        checks.push({ id: "duplicate", ok: false, message: `Invoice number ${normalized.number} already exists` });
      }
    }
    const accepted = checks.every((c) => c.ok);
    if (resolution.kind === "create" && !accepted) {
      const clientCheck = checks.find((c) => c.id === "client")!;
      clientCheck.ok = false;
      clientCheck.message = `New customer “${resolution.name}” (${resolution.email}) — not created automatically because the invoice needs review`;
    }
    const paid = normalized.totalMinor !== null && normalized.paidMinor >= normalized.totalMinor;

    // Deterministic IDs so a retried step updates rather than duplicates.
    const invoiceId = `inv_${documentId}`;
    const invoiceRef = col.invoices.doc(invoiceId);

    const clientId = await adminDb().runTransaction(async (tx) => {
      let linked: string | null = resolution.kind === "matched" ? resolution.clientId : null;
      let createRef: FirebaseFirestore.DocumentReference | null = null;
      if (resolution.kind === "create" && accepted) {
        // Re-check inside the transaction: another extraction may have just created this client.
        const existing = await tx.get(col.clients.where("emails", "array-contains", resolution.email).limit(1));
        const ref = col.clients.doc(`cl_${createHash("sha256").update(resolution.email).digest("hex").slice(0, 24)}`);
        if (!existing.empty) linked = existing.docs[0].id;
        else if ((await tx.get(ref)).exists) linked = ref.id; // never overwrite an existing client
        else {
          createRef = ref;
          linked = ref.id;
        }
      }
      const invoice: Omit<Invoice, "createdAt" | "updatedAt"> = {
        number: normalized.number,
        clientId: linked,
        clientNameRaw: raw.clientName,
        clientEmailRaw: raw.clientEmail?.trim() || null,
        issueDate: normalized.issueDate,
        dueDate: normalized.dueDate,
        currency: normalized.currency,
        totalMinor: normalized.totalMinor,
        paidMinor: normalized.paidMinor,
        paymentEvidence: normalized.paymentEvidence,
        status: paid ? "paid" : normalized.paidMinor > 0 ? "partially_paid" : "open",
        reviewStatus: accepted ? "auto_accepted" : "needs_review",
        checks,
        source: "extracted",
        sourceDocumentId: documentId,
        sourcePages: raw.sourcePages,
        reminderStage: null,
        lastRemindedAt: null,
        isSample: false,
      };
      if (createRef && resolution.kind === "create") {
        tx.set(createRef, {
          name: resolution.name,
          normalizedName: normalizeName(resolution.name),
          emails: [resolution.email],
          source: "extracted",
          isSample: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        await audit(ctx.workspaceId, "system", "client.created_from_invoice", `clients/${createRef.id}`, { documentId }, tx);
      }
      tx.set(invoiceRef, { ...invoice, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      tx.update(docRef, { status: "processed", invoiceIds: [invoiceId], error: FieldValue.delete() });
      await audit(ctx.workspaceId, "system", "invoice.extracted", `invoices/${invoiceId}`, { documentId, reviewStatus: invoice.reviewStatus }, tx);
      return linked;
    });

    const failedChecks = checks.filter((c) => !c.ok).map((c) => c.message);
    return {
      output: { documentId, invoiceId, clientId, outcome: accepted ? "auto_accepted" : "needs_review", number: normalized.number, fileName: record.fileName, failedChecks },
      costMicros,
      verification: accepted ? "pass" : "needs_review",
    };
  },
});

registerTool({
  name: "summarize_extraction",
  lane: "verification",
  permission: "read",
  maxAttempts: 2,
  argsSchema: z.object({ documentIds: z.array(z.string()) }),
  async run(ctx, { documentIds }) {
    const col = ws(ctx.workspaceId);
    const report = { verified: [] as string[], failed: [] as string[], skipped: [] as string[], needsReview: [] as string[] };
    for (const id of documentIds) {
      const doc = (await col.documents.doc(id).get()).data() as DocumentRecord | undefined;
      const name = doc?.fileName ?? id;
      if (!doc) report.failed.push(`${name}: document missing`);
      else if (doc.status === "processed") {
        const inv = (await col.invoices.doc(doc.invoiceIds[0]).get()).data() as Invoice | undefined;
        if (inv?.reviewStatus === "auto_accepted") report.verified.push(`${name}: invoice ${inv.number} added (all checks passed)`);
        else {
          const issues = inv?.checks.filter((c) => !c.ok).map((c) => c.message).join("; ");
          report.needsReview.push(`${name}: needs your review${issues ? ` — ${issues}` : ""}`);
        }
      } else if (doc.status === "rejected") report.skipped.push(`${name}: ${doc.error ?? "not an invoice"}`);
      else report.failed.push(`${name}: ${doc.error ?? "extraction did not finish"}`);
    }
    const anyBad = report.failed.length > 0;
    return {
      output: {},
      report,
      verification: report.needsReview.length || anyBad ? "needs_review" : "pass",
      finalStatus: anyBad ? (report.verified.length + report.needsReview.length ? "partially_succeeded" : "failed") : "succeeded",
      summary: `${report.verified.length} added, ${report.needsReview.length} need review, ${report.skipped.length} rejected, ${report.failed.length} failed.`,
    };
  },
});
