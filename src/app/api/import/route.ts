import { csvImportInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { importClients, importPayments } from "@/lib/server/services/csv-import";

export const POST = handler(async (req) => {
  const ctx = await requireWorkspace();
  const { kind, csv } = await readJson(req, csvImportInput);
  const result = kind === "clients" ? await importClients(ctx, csv) : await importPayments(ctx, csv);
  return ok(result);
});
