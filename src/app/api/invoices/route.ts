import { invoiceInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { createInvoice } from "@/lib/server/services/records";

export const POST = handler(async (req) => {
  const ctx = await requireWorkspace();
  const id = await createInvoice(ctx, await readJson(req, invoiceInput));
  return ok({ id }, 201);
});
