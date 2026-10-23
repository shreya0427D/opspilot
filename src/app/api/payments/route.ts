import { paymentInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { recordManualPayment } from "@/lib/server/services/records";

export const POST = handler(async (req) => {
  const ctx = await requireWorkspace();
  const id = await recordManualPayment(ctx, await readJson(req, paymentInput));
  return ok({ id }, 201);
});
