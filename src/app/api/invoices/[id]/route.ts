import { z } from "zod";
import { invoiceInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { deleteInvoice, saveInvoiceFields, setInvoiceStatus } from "@/lib/server/services/records";

/** Full edit; also how an invoice under review gets confirmed. */
export const PUT = handler<RouteContext<"/api/invoices/[id]">>(async (req, { params }) => {
  const ctx = await requireWorkspace();
  const { id } = await params;
  await saveInvoiceFields(ctx, id, await readJson(req, invoiceInput));
  return ok();
});

export const PATCH = handler<RouteContext<"/api/invoices/[id]">>(async (req, { params }) => {
  const ctx = await requireWorkspace();
  const { id } = await params;
  const { action } = await readJson(req, z.object({ action: z.enum(["mark_paid", "void", "reopen"]) }));
  await setInvoiceStatus(ctx, id, action);
  return ok();
});

export const DELETE = handler<RouteContext<"/api/invoices/[id]">>(async (_req, { params }) => {
  const ctx = await requireWorkspace();
  const { id } = await params;
  await deleteInvoice(ctx, id);
  return ok();
});
